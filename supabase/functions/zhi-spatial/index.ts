import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { buildUnifiedEnvironmentEvents } from "./perception_events.ts";

type Actor = { userId: string; capabilities: string[] };
const json = (body: unknown, status = 200, headers: Record<string,string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: {
    "content-type":"application/json; charset=utf-8",
    "cache-control":"no-store",
    "x-content-type-options":"nosniff",
    ...headers,
  }});
function cors(req: Request): Record<string,string> | null {
  const origin=req.headers.get("origin");
  const allowed=(Deno.env.get("ZHI_ALLOWED_ORIGINS") ?? "https://zhimia2026-source.github.io")
    .split(",").map(x=>x.trim()).filter(Boolean);
  if(origin && !allowed.includes(origin)) return null;
  return {
    ...(origin ? {"access-control-allow-origin":origin}: {}),
    "access-control-allow-headers":"authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods":"GET, POST, OPTIONS",
    "vary":"Origin",
  };
}
function dbClient(): SupabaseClient {
  const url=Deno.env.get("SUPABASE_URL") ?? "";
  const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if(!url || !key) throw new Error("server_configuration_missing");
  return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
}
async function sha256(value:string):Promise<string>{
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function authenticate(db:SupabaseClient,req:Request):Promise<Actor|null>{
  const token=req.headers.get("authorization")?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if(!token || token.length>4096) return null;
  const {data,error}=await db.from("zhi_personal_access_tokens")
    .select("id,user_id,expires_at,revoked_at,capabilities")
    .eq("token_hash",await sha256(token)).maybeSingle();
  if(error || !data || data.revoked_at || (data.expires_at && Date.parse(data.expires_at)<=Date.now())) return null;
  const {data:touched,error:touchError}=await db.from("zhi_personal_access_tokens")
    .update({last_used_at:new Date().toISOString()}).eq("id",data.id).is("revoked_at",null).select("id").maybeSingle();
  if(touchError || !touched) return null;
  return {userId:data.user_id,capabilities:Array.isArray(data.capabilities)?data.capabilities:[]};
}
const hasCap=(actor:Actor,cap:string)=>actor.capabilities.includes(cap);
const isUuid=(v:unknown):v is string=>typeof v==="string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
async function readBody(req:Request):Promise<Record<string,unknown>>{
  const raw=await req.text();
  if(new TextEncoder().encode(raw).length>12000) throw new Error("body_too_large");
  const value=raw?JSON.parse(raw):{};
  if(!value || typeof value!=="object" || Array.isArray(value)) throw new Error("invalid_json");
  return value as Record<string,unknown>;
}
async function authorizedWorld(db:SupabaseClient,worldId:string,actor:Actor,agentId:string){
  const {data:world,error}=await db.from("zhi_worlds")
    .select("id,name,description,visibility,entry_policy,status,updated_at,environment_state")
    .eq("id",worldId).maybeSingle();
  if(error) throw new Error("database_error");
  if(!world || world.status!=="open") return null;
  if(world.visibility==="public" && world.entry_policy==="open") return world;
  const {data:membership,error:membershipError}=await db.from("zhi_world_memberships")
    .select("id,expires_at,status,revoked_at,capabilities")
    .eq("world_id",worldId).eq("principal_user_id",actor.userId).eq("agent_id",agentId)
    .eq("status","active").is("revoked_at",null).maybeSingle();
  if(membershipError) throw new Error("database_error");
  if(!membership || (membership.expires_at && Date.parse(membership.expires_at)<=Date.now()) ||
    !Array.isArray(membership.capabilities) || !membership.capabilities.includes("spatial:perception.read")) return null;
  return world;
}
Deno.serve(async(req:Request)=>{
  const ch=cors(req);
  if(!ch) return json({error:"origin_not_allowed"},403);
  const reply=(body:unknown,status=200)=>json(body,status,ch);
  if(req.method==="OPTIONS") return new Response(null,{status:204,headers:ch});
  if(!["GET","POST"].includes(req.method)) return reply({error:"method_not_allowed"},405);
  try{
    const db=dbClient();
    const actor=await authenticate(db,req);
    if(!actor) return reply({error:"invalid_token"},401);
    const url=new URL(req.url);
    const marker="/functions/v1/zhi-spatial";
    const path=url.pathname.includes(marker)?url.pathname.slice(url.pathname.indexOf(marker)+marker.length):url.pathname;
    const parts=path.split("/").filter(Boolean);
    if(parts.length!==4 || parts[0]!=="v1" || parts[1]!=="agents" || !isUuid(parts[2])) return reply({error:"not_found"},404);
    const agentId=parts[2];
    if(parts[3]!=="perception" && parts[3]!=="presence") return reply({error:"not_found"},404);
    const {data:agent,error:agentError}=await db.from("zhi_agents")
      .select("id,owner_user_id,display_name,status").eq("id",agentId).eq("owner_user_id",actor.userId).maybeSingle();
    if(agentError) throw new Error("database_error");
    if(!agent) return reply({error:"not_found"},404);
    if(agent.status!=="active") return reply({error:"agent_not_active"},409);

    if(req.method==="GET" && parts[3]==="perception"){
      if(!hasCap(actor,"community.scene.discover")) return reply({error:"insufficient_capability",required:"community.scene.discover"},403);
      const worldId=url.searchParams.get("world_id");
      if(!isUuid(worldId)) return reply({error:"invalid_world_id"},400);
      const world=await authorizedWorld(db,worldId,actor,agentId);
      if(!world) return reply({error:"scene_access_denied"},403);
      const [{data:nodes,error:nodesError},{data:edges,error:edgesError},{data:ecosystem,error:ecosystemError},{data:presence,error:presenceError},{data:ecosystemEvents,error:ecosystemEventsError},{data:spatialEvents,error:spatialEventsError}] = await Promise.all([
        db.from("zhi_spatial_nodes").select("id,parent_node_id,node_type,stable_key,name,description,coordinate,coordinate_frame,visibility,entry_policy,observability,source_kind,source_ref,source_updated_at,observed_at,valid_until,metadata,owner_agent_id,owner_user_id")
          .eq("world_id",worldId).eq("status","active").order("node_type").limit(300),
        db.from("zhi_spatial_edges").select("id,from_node_id,to_node_id,relation,directed,access_policy,travel_cost,source_kind,source_ref")
          .eq("world_id",worldId).eq("status","active").limit(600),
        db.from("zhi_ecosystem_states").select("revision,world_time,updated_at,state").eq("world_id",worldId).maybeSingle(),
        db.from("zhi_spatial_presence").select("agent_id,world_id,anchor_node_id,current_node_id,position_status,coordinate_estimate,confidence,last_confirmed_at,provenance,revision,updated_at")
          .eq("agent_id",agentId).eq("owner_user_id",actor.userId).eq("world_id",worldId).maybeSingle(),
        db.from("zhi_ecosystem_events").select("id,state_revision,event_kind,source_kind,occurred_at,payload,causal_chain")
          .eq("world_id",worldId).order("occurred_at",{ascending:false}).limit(50),
        db.from("zhi_spatial_environment_events").select("id,event_type,environment_revision,occurred_at,perception_delta,metadata,from_node_id,to_node_id,affected_object_ids")
          .eq("world_id",worldId).eq("agent_id",agentId).eq("owner_user_id",actor.userId)
          .order("occurred_at",{ascending:false}).limit(50)
      ]);
      if(nodesError||edgesError||ecosystemError||presenceError||ecosystemEventsError||spatialEventsError) throw new Error("database_error");
      const environmentEvents=buildUnifiedEnvironmentEvents(ecosystemEvents??[],spatialEvents??[]);
      const visibleNodes=(nodes??[]).filter(n=>n.visibility==="public" || (n.owner_agent_id===agentId && n.owner_user_id===actor.userId));
      const visibleIds=new Set(visibleNodes.map(n=>n.id));
      const visibleEdges=(edges??[]).filter(e=>visibleIds.has(e.from_node_id)&&visibleIds.has(e.to_node_id)&&["inherit","open"].includes(e.access_policy));
      const state=ecosystem?.state && typeof ecosystem.state==="object"?ecosystem.state:{};
      const unknowns=visibleNodes.filter(n=>n.observability==="unknown" || n.observability==="unobserved" || n.coordinate===null)
        .map(n=>({node_id:n.id,stable_key:n.stable_key,name:n.name,reason:n.coordinate===null?"coordinate_unavailable":n.observability}));
      const requestId=crypto.randomUUID();
      const {error:auditError}=await db.from("zhi_spatial_perception_events").insert({
        request_id:requestId,agent_id:agentId,owner_user_id:actor.userId,world_id:worldId,
        source_revision:ecosystem?.revision??null,known_fact_count:visibleNodes.length,
        private_memory_included:false,modeled_inference_count:ecosystem?1:0,
        unknown_count:unknowns.length,access_decision:"allowed"
      });
      if(auditError) throw new Error("audit_unavailable");
      return reply({
        request_id:requestId,
        epistemic_contract:{
          known_facts:"database records returned below; source and freshness are attached",
          private_memory:"not loaded by this endpoint; must be supplied only by the agent's own private-memory runtime",
          modeled_inference:"ecosystem_state is a simulated model, not physical observation",
          unknown_unobserved:"missing coordinates or unobserved nodes remain explicitly unknown"
        },
        agent:{id:agent.id,display_name:agent.display_name},
        world:{id:world.id,name:world.name,visibility:world.visibility,entry_policy:world.entry_policy,status:world.status},
        known_facts:{spatial_nodes:visibleNodes,spatial_edges:visibleEdges},
        private_memory:{included:false,items:[],access:"agent_private_memory_runtime_only"},
        modeled_inference:ecosystem?{
          source:"zhi_ecosystem_states",
          source_kind:"world_generated_model",
          model_status:state.simulation_status??"unknown",
          revision:ecosystem.revision,
          world_time:ecosystem.world_time,
          updated_at:ecosystem.updated_at,
          environment_state:state
        }:null,
        unknown_unobserved:unknowns,
        environment_feedback:{
          source:"zhi_spatial_perception.v2",
          event_stream_contract:{
            includes:["zhi_ecosystem_events","zhi_spatial_environment_events"],
            ordering:"occurred_at_ascending",
            ecosystem_scope:"shared_world_events",
            spatial_scope:"current_agent_and_owner_only",
            causal_chain:"preserved_when_recorded; empty_when_not_recorded",
            epistemic_rule:"modeled events are not physical sensor observations"
          },
          event_count:environmentEvents.length,
          events:environmentEvents
        },
        spatial_continuity:presence??{
          agent_id:agentId,world_id:worldId,anchor_node_id:null,current_node_id:null,
          position_status:"position_unobserved",coordinate_estimate:null,confidence:null,
          provenance:"unobserved",revision:0
        }
      });
    }

    if(req.method==="POST" && parts[3]==="presence"){
      if(!hasCap(actor,"community.scene.enter")) return reply({error:"insufficient_capability",required:"community.scene.enter"},403);
      const body=await readBody(req);
      const worldId=body.world_id;
      if(!isUuid(worldId)) return reply({error:"invalid_world_id"},400);
      const world=await authorizedWorld(db,worldId,actor,agentId);
      if(!world) return reply({error:"scene_access_denied"},403);
      const allowedStatus=["anchor_known","observed","inferred","position_unobserved","unknown"];
      const status=String(body.position_status??"position_unobserved");
      if(!allowedStatus.includes(status)) return reply({error:"invalid_position_status"},400);
      const anchorId=body.anchor_node_id??null;
      const currentId=body.current_node_id??null;
      if(anchorId!==null&&!isUuid(anchorId)) return reply({error:"invalid_anchor_node_id"},400);
      if(currentId!==null&&!isUuid(currentId)) return reply({error:"invalid_current_node_id"},400);
      if((status==="observed" && currentId===null) || (status==="anchor_known" && anchorId===null))
        return reply({error:"position_evidence_required"},400);
      for(const nodeId of [anchorId,currentId].filter(Boolean)){
        const {data:node,error}=await db.from("zhi_spatial_nodes").select("id,world_id,visibility,owner_agent_id,owner_user_id")
          .eq("id",nodeId).eq("world_id",worldId).eq("status","active").maybeSingle();
        if(error) throw new Error("database_error");
        if(!node || (node.visibility==="private" && (node.owner_agent_id!==agentId || node.owner_user_id!==actor.userId)))
          return reply({error:"spatial_node_access_denied"},403);
      }
      const coordinate=body.coordinate_estimate??null;
      if(coordinate!==null && (typeof coordinate!=="object" || Array.isArray(coordinate) || JSON.stringify(coordinate).length>1000))
        return reply({error:"invalid_coordinate_estimate"},400);
      const confidence=body.confidence===undefined?null:Number(body.confidence);
      if(confidence!==null && (!Number.isFinite(confidence)||confidence<0||confidence>1)) return reply({error:"invalid_confidence"},400);
      const provenance=String(body.provenance??(status==="observed"?"direct_observation":status==="inferred"?"modeled_inference":"unobserved"));
      if(!["direct_observation","agent_report","database_anchor","modeled_inference","unobserved"].includes(provenance))
        return reply({error:"invalid_provenance"},400);
      const {data:priorPresence,error:priorError}=await db.from("zhi_spatial_presence").select("revision,last_confirmed_at").eq("agent_id",agentId).eq("owner_user_id",actor.userId).eq("world_id",worldId).maybeSingle();
      if(priorError) throw new Error("database_error");
      if((status==="position_unobserved"||status==="unknown")&&(currentId!==null||coordinate!==null)) return reply({error:"unobserved_position_cannot_claim_location"},400);
      const lastConfirmedAt=status==="observed"?new Date().toISOString():(priorPresence?.last_confirmed_at??null);
      const {data:updated,error}=await db.from("zhi_spatial_presence").upsert({
        agent_id:agentId,owner_user_id:actor.userId,world_id:worldId,
        anchor_node_id:anchorId,current_node_id:currentId,position_status:status,
        coordinate_estimate:coordinate,confidence,last_confirmed_at:lastConfirmedAt,
        provenance,revision:(priorPresence?.revision??0)+1,updated_at:new Date().toISOString()
      },{onConflict:"agent_id,world_id"}).select("agent_id,world_id,anchor_node_id,current_node_id,position_status,coordinate_estimate,confidence,last_confirmed_at,provenance,revision,updated_at").single();
      if(error||!updated) throw new Error("database_error");
      return reply({presence:updated},200);
    }
    return reply({error:"not_found"},404);
  }catch(error){
    const message=error instanceof Error?error.message:"internal_error";
    if(message==="body_too_large"||message==="invalid_json") return reply({error:message},400);
    if(message==="server_configuration_missing") return reply({error:message},503);
    if(message==="audit_unavailable") return reply({error:message},503);
    return reply({error:"internal_error"},500);
  }
});
