import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { validatePublicMovementRoute } from "../zhi-community/movement_helpers.ts";

type Actor = { userId: string; capabilities: string[] };
const json = (body: unknown, status=200, headers: Record<string,string>={}) =>
  new Response(JSON.stringify(body), { status, headers: {
    "content-type":"application/json; charset=utf-8",
    "cache-control":"no-store",
    "x-content-type-options":"nosniff",
    ...headers,
  }});
function cors(req:Request):Record<string,string>|null {
  const origin=req.headers.get("origin");
  const allowed=(Deno.env.get("ZHI_ALLOWED_ORIGINS") ?? "https://zhimia2026-source.github.io")
    .split(",").map(x=>x.trim()).filter(Boolean);
  if(origin && !allowed.includes(origin)) return null;
  return {
    ...(origin?{"access-control-allow-origin":origin}:{}),
    "access-control-allow-headers":"authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods":"GET, POST, OPTIONS",
    "vary":"Origin",
  };
}
function dbClient():SupabaseClient {
  const url=Deno.env.get("SUPABASE_URL")??"";
  const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
  if(!url||!key) throw new Error("server_configuration_missing");
  return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
}
async function sha256(value:string):Promise<string>{
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function authenticate(db:SupabaseClient,req:Request):Promise<Actor|null>{
  const token=req.headers.get("authorization")?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if(!token||token.length>4096) return null;
  const {data,error}=await db.from("zhi_personal_access_tokens")
    .select("id,user_id,expires_at,revoked_at,capabilities")
    .eq("token_hash",await sha256(token)).maybeSingle();
  if(error||!data||data.revoked_at||(data.expires_at&&Date.parse(data.expires_at)<=Date.now())) return null;
  const {data:touched,error:touchError}=await db.from("zhi_personal_access_tokens")
    .update({last_used_at:new Date().toISOString()}).eq("id",data.id).is("revoked_at",null).select("id").maybeSingle();
  if(touchError||!touched) return null;
  return {userId:data.user_id,capabilities:Array.isArray(data.capabilities)?data.capabilities:[]};
}
const hasCap=(actor:Actor,cap:string)=>actor.capabilities.includes(cap);
const isUuid=(v:unknown):v is string=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
async function readBody(req:Request):Promise<Record<string,unknown>>{
  const raw=await req.text();
  if(new TextEncoder().encode(raw).length>12000) throw new Error("body_too_large");
  const value=raw?JSON.parse(raw):{};
  if(!value||typeof value!=="object"||Array.isArray(value)) throw new Error("invalid_json");
  return value as Record<string,unknown>;
}
async function ownedAgent(db:SupabaseClient,agentId:string,actor:Actor){
  const {data,error}=await db.from("zhi_agents").select("id,owner_user_id,status,display_name")
    .eq("id",agentId).eq("owner_user_id",actor.userId).maybeSingle();
  if(error) throw new Error("database_error");
  if(!data) throw new Error("agent_not_found");
  if(data.status!=="active") throw new Error("agent_not_active");
  return data;
}
async function canEnterWorld(db:SupabaseClient,worldId:string,agentId:string,actor:Actor){
  const {data:world,error}=await db.from("zhi_worlds")
    .select("id,name,status,visibility,entry_policy").eq("id",worldId).maybeSingle();
  if(error) throw new Error("database_error");
  if(!world||world.status!=="open") throw new Error("world_unavailable");
  if(world.visibility==="public"&&world.entry_policy==="open") return world;
  const {data:membership,error:membershipError}=await db.from("zhi_world_memberships")
    .select("id,expires_at,status,revoked_at,capabilities")
    .eq("world_id",worldId).eq("principal_user_id",actor.userId).eq("agent_id",agentId)
    .eq("status","active").is("revoked_at",null).maybeSingle();
  if(membershipError) throw new Error("database_error");
  if(!membership||(membership.expires_at&&Date.parse(membership.expires_at)<=Date.now())||
    !Array.isArray(membership.capabilities)||!membership.capabilities.includes("community.scene.enter"))
    throw new Error("scene_access_denied");
  return world;
}
function shortestPath(start:string,target:string,edges:any[]):string[]|null{
  const graph=new Map<string,{to:string,cost:number}[]>();
  for(const e of edges??[]){
    const cost=Number(e.travel_cost??1);
    if(!Number.isFinite(cost)||cost<0) continue;
    if(!graph.has(e.from_node_id)) graph.set(e.from_node_id,[]);
    graph.get(e.from_node_id)!.push({to:e.to_node_id,cost});
    if(!e.directed){
      if(!graph.has(e.to_node_id)) graph.set(e.to_node_id,[]);
      graph.get(e.to_node_id)!.push({to:e.from_node_id,cost});
    }
  }
  const dist=new Map<string,number>([[start,0]]);
  const prev=new Map<string,string>();
  const done=new Set<string>();
  while(true){
    let node:string|null=null, best=Infinity;
    for(const [id,d] of dist) if(!done.has(id)&&d<best){node=id;best=d;}
    if(node===null) break;
    if(node===target) break;
    done.add(node);
    for(const edge of graph.get(node)??[]){
      const next=best+edge.cost;
      if(next<(dist.get(edge.to)??Infinity)){dist.set(edge.to,next);prev.set(edge.to,node);}
    }
  }
  if(!dist.has(target)) return null;
  const path=[target]; let cursor=target;
  while(cursor!==start){const p=prev.get(cursor);if(!p)return null;path.push(p);cursor=p;}
  const resolved=path.reverse();
  return resolved.length<=32?resolved:null;
}
const statusFor=(code:string)=>{
  if(code==="invalid_token") return 401;
  if(code==="insufficient_capability"||code==="scene_access_denied"||code==="movement_capability_required") return 403;
  if(code==="agent_not_found"||code==="not_found") return 404;
  if(code==="agent_not_active"||code==="world_unavailable"||code==="movement_state_conflict"||code==="presence_revision_conflict") return 409;
  if(code==="body_too_large"||code==="invalid_json"||code.startsWith("invalid_")||code==="current_position_unconfirmed") return 400;
  if(code==="route_not_found"||code==="route_validation_failed") return 409;
  if(code==="server_configuration_missing") return 503;
  return 500;
};

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
    const marker="/functions/v1/zhi-movement";
    const path=url.pathname.includes(marker)?url.pathname.slice(url.pathname.indexOf(marker)+marker.length):url.pathname;
    const parts=path.split("/").filter(Boolean);
    if(parts.length!==4||parts[0]!=="v1"||parts[1]!=="agents"||!isUuid(parts[2])||parts[3]!=="movement")
      return reply({error:"not_found"},404);
    const agentId=parts[2];
    const agent=await ownedAgent(db,agentId,actor);

    if(req.method==="GET"){
      if(!hasCap(actor,"community.scene.enter")) return reply({error:"insufficient_capability",required:"community.scene.enter"},403);
      const worldId=url.searchParams.get("world_id");
      if(!isUuid(worldId)) return reply({error:"invalid_world_id"},400);
      await canEnterWorld(db,worldId,agentId,actor);
      const [{data:requests,error:requestError},{data:presence,error:presenceError}] = await Promise.all([
        db.from("zhi_movement_requests").select("id,world_id,from_node_id,to_node_id,status,route_node_ids,request_reason,approval_required,approved_at,execution_started_at,arrival_requested_at,completed_at,created_at,updated_at")
          .eq("agent_id",agentId).eq("owner_user_id",actor.userId).eq("world_id",worldId).order("created_at",{ascending:false}).limit(30),
        db.from("zhi_spatial_presence").select("agent_id,world_id,current_node_id,position_status,confidence,last_confirmed_at,provenance,revision")
          .eq("agent_id",agentId).eq("owner_user_id",actor.userId).eq("world_id",worldId).maybeSingle()
      ]);
      if(requestError||presenceError) throw new Error("database_error");
      return reply({agent:{id:agent.id,display_name:agent.display_name},presence:presence??{
        current_node_id:null,position_status:"position_unobserved",revision:0
      },movement_requests:requests??[]});
    }

    const body=await readBody(req);
    const action=String(body.action??"");
    if(action==="request"){
      if(!hasCap(actor,"community.scene.enter")) return reply({error:"insufficient_capability",required:"community.scene.enter"},403);
      if(!hasCap(actor,"spatial:movement.execute")) return reply({error:"movement_capability_required",required:"spatial:movement.execute"},403);
      const worldId=body.world_id, targetId=body.to_node_id, idem=String(body.idempotency_key??"");
      if(!isUuid(worldId)||!isUuid(targetId)||idem.length<8||idem.length>160) return reply({error:"invalid_request_parameters"},400);
      await canEnterWorld(db,worldId,agentId,actor);
      const {data:membership,error:membershipError}=await db.from("zhi_world_memberships")
        .select("id,principal_user_id,agent_id,status,revoked_at,expires_at,capabilities")
        .eq("world_id",worldId).eq("principal_user_id",actor.userId).eq("agent_id",agentId)
        .eq("status","active").is("revoked_at",null).maybeSingle();
      if(membershipError) throw new Error("database_error");
      if(!membership||(membership.expires_at&&Date.parse(membership.expires_at)<=Date.now())||
        !Array.isArray(membership.capabilities)||!membership.capabilities.includes("spatial:movement.execute"))
        return reply({error:"movement_capability_required",required:"membership.spatial:movement.execute"},403);
      const {data:existing,error:existingError}=await db.from("zhi_movement_requests").select("*")
        .eq("agent_id",agentId).eq("world_id",worldId).eq("idempotency_key",idem).maybeSingle();
      if(existingError) throw new Error("database_error");
      if(existing){
        if(existing.status==="executing"&&existing.approval_required===false&&!existing.approved_by_user_id){
          const {data:replayedCommit,error:replayCommitError}=await db.rpc("zhi_movement_commit_virtual",{
            p_movement_request_id:existing.id,p_actor_user_id:actor.userId
          });
          if(replayCommitError) return reply({movement_request:existing,replayed:true,error:"virtual_movement_commit_pending",position_changed:false},409);
          return reply({movement_request:replayedCommit?.movement_request??existing,arrival:replayedCommit,
            arrival_kind:"modeled_virtual",replayed:true,position_changed:replayedCommit?.ok===true&&!replayedCommit?.replayed});
        }
        return reply({movement_request:existing,replayed:true,position_changed:false});
      }
      const {data:presence,error:presenceError}=await db.from("zhi_spatial_presence").select("*")
        .eq("agent_id",agentId).eq("owner_user_id",actor.userId).eq("world_id",worldId).maybeSingle();
      if(presenceError) throw new Error("database_error");
      if(!presence?.current_node_id||!["observed","anchor_known","inferred"].includes(presence.position_status))
        return reply({error:"current_position_unconfirmed",position_status:presence?.position_status??"position_unobserved"},409);
      if(presence.current_node_id===targetId) return reply({error:"already_at_destination"},409);
      const {data:nodes,error:nodesError}=await db.from("zhi_spatial_nodes")
        .select("id,world_id,node_type,visibility,entry_policy,status")
        .eq("world_id",worldId).eq("status","active").limit(500);
      if(nodesError) throw new Error("database_error");
      const traversableNodes=(nodes??[]).filter((n:any)=>
        ["world","region","place"].includes(n.node_type) &&
        n.visibility==="public" && ["inherit","open"].includes(n.entry_policy)
      );
      const traversableIds=new Set(traversableNodes.map((n:any)=>n.id));
      if(!traversableIds.has(presence.current_node_id)||!traversableIds.has(targetId))
        return reply({error:"spatial_node_access_denied"},403);
      const {data:edges,error:edgesError}=await db.from("zhi_spatial_edges")
        .select("world_id,from_node_id,to_node_id,relation,directed,access_policy,status,travel_cost")
        .eq("world_id",worldId).eq("status","active").in("relation",["adjacent_to","route_to","entrance_to"])
        .in("access_policy",["inherit","open"]).limit(2000);
      if(edgesError) throw new Error("database_error");
      const routeEdges=(edges??[]).filter((e:any)=>traversableIds.has(e.from_node_id)&&traversableIds.has(e.to_node_id));
      const route=shortestPath(presence.current_node_id,targetId,routeEdges);
      if(!route) return reply({error:"route_not_found",from_node_id:presence.current_node_id,to_node_id:targetId},409);
      const routeCheck=validatePublicMovementRoute({
        world_id:worldId,world_status:"open",start_node_id:presence.current_node_id,target_node_id:targetId,
        route_node_ids:route,nodes:traversableNodes,edges:routeEdges
      });
      if(!routeCheck.ok) return reply({error:"route_validation_failed",reason:routeCheck.reason},409);
      const reason=String(body.reason??"").slice(0,1000);
      const {data:created,error:createError}=await db.from("zhi_movement_requests").insert({
        world_id:worldId,agent_id:agentId,owner_user_id:actor.userId,
        from_node_id:presence.current_node_id,to_node_id:targetId,status:"executing",
        requested_by:"agent",request_reason:reason,route_node_ids:route,
        expected_presence_revision:presence.revision,approval_required:false,idempotency_key:idem,
        execution_started_at:new Date().toISOString(),
        metadata:{movement_policy:"public_scene_free_movement",creator_approval_required:false,private_memory_included:false}
      }).select("*").single();
      if(createError||!created) throw new Error("database_error");
      const {data:committed,error:commitError}=await db.rpc("zhi_movement_commit_virtual",{
        p_movement_request_id:created.id,p_actor_user_id:actor.userId
      });
      if(commitError) return reply({movement_request:created,route,error:"virtual_movement_commit_pending",position_changed:false},409);
      return reply({movement_request:committed?.movement_request??created,route,arrival:committed,
        arrival_kind:"modeled_virtual",position_changed:committed?.ok===true&&!committed?.replayed});
    }

    const requestId=body.movement_request_id;
    if(!isUuid(requestId)) return reply({error:"invalid_movement_request_id"},400);
    const {data:movement,error:movementError}=await db.from("zhi_movement_requests").select("*")
      .eq("id",requestId).eq("agent_id",agentId).eq("owner_user_id",actor.userId).maybeSingle();
    if(movementError) throw new Error("database_error");
    if(!movement) return reply({error:"not_found"},404);

    if(action==="commit_virtual"){
      if(!hasCap(actor,"spatial:movement.execute"))
        return reply({error:"movement_capability_required",required:"spatial:movement.execute"},403);
      if(movement.status==="arrived"&&movement.metadata?.arrival_kind==="modeled_virtual")
        return reply({movement_request:movement,arrival_kind:"modeled_virtual",replayed:true,position_changed:false});
      if(movement.status!=="executing"||movement.approval_required!==false||movement.approved_by_user_id)
        return reply({error:"movement_state_conflict",status:movement.status},409);
      await canEnterWorld(db,movement.world_id,agentId,actor);
      const {data:membership,error:membershipError}=await db.from("zhi_world_memberships")
        .select("id,principal_user_id,agent_id,status,revoked_at,expires_at,capabilities")
        .eq("world_id",movement.world_id).eq("principal_user_id",actor.userId).eq("agent_id",agentId)
        .eq("status","active").is("revoked_at",null).maybeSingle();
      if(membershipError) throw new Error("database_error");
      if(!membership||(membership.expires_at&&Date.parse(membership.expires_at)<=Date.now())||
        !Array.isArray(membership.capabilities)||!membership.capabilities.includes("spatial:movement.execute"))
        return reply({error:"movement_capability_required",required:"membership.spatial:movement.execute"},403);
      const {data:committed,error:commitError}=await db.rpc("zhi_movement_commit_virtual",{
        p_movement_request_id:requestId,p_actor_user_id:actor.userId
      });
      if(commitError) return reply({error:"virtual_movement_commit_failed",detail:"The server-side transaction rejected this movement."},409);
      return reply({movement_request:committed?.movement_request??null,arrival:committed,
        arrival_kind:"modeled_virtual",position_changed:committed?.ok===true&&!committed?.replayed});
    }

    if(action==="approve"){
      if(!hasCap(actor,"community.scene.create")) return reply({error:"insufficient_capability",required:"community.scene.create"},403);
      if(movement.status!=="awaiting_approval") return reply({error:"movement_state_conflict",status:movement.status},409);
      const {data:updated,error}=await db.from("zhi_movement_requests").update({
        status:"approved",approved_by_user_id:actor.userId,approved_at:new Date().toISOString(),
        approval_note:String(body.note??"").slice(0,1000),updated_at:new Date().toISOString()
      }).eq("id",requestId).eq("status","awaiting_approval").select("*").maybeSingle();
      if(error) throw new Error("database_error");
      if(!updated) return reply({error:"movement_state_conflict"},409);
      return reply({movement_request:updated,position_changed:false});
    }

    if(action==="begin"){
      if(!hasCap(actor,"community.scene.enter")) return reply({error:"insufficient_capability",required:"community.scene.enter"},403);
      if(movement.status!=="approved") return reply({error:"movement_state_conflict",status:movement.status},409);
      const {data:updated,error}=await db.from("zhi_movement_requests").update({
        status:"executing",execution_started_at:new Date().toISOString(),updated_at:new Date().toISOString()
      }).eq("id",requestId).eq("status","approved").select("*").maybeSingle();
      if(error) throw new Error("database_error");
      if(!updated) return reply({error:"movement_state_conflict"},409);
      return reply({movement_request:updated,position_changed:false});
    }

    if(action==="evidence"){
      if(!hasCap(actor,"community.scene.enter")) return reply({error:"insufficient_capability",required:"community.scene.enter"},403);
      if(!["executing","arrival_pending","evidence_insufficient"].includes(movement.status))
        return reply({error:"movement_state_conflict",status:movement.status},409);
      const evidenceType=String(body.evidence_type??"agent_report");
      const allowed=["direct_observation","signed_runtime_report","human_confirmation","agent_report","modeled_inference","database_anchor"];
      if(!allowed.includes(evidenceType)) return reply({error:"invalid_evidence_type"},400);
      const observedNodeId=body.observed_node_id??null;
      if(observedNodeId!==null&&!isUuid(observedNodeId)) return reply({error:"invalid_observed_node_id"},400);
      const humanVerified=evidenceType==="human_confirmation"&&hasCap(actor,"community.scene.create")&&observedNodeId===movement.to_node_id;
      const coordinate=body.coordinate??null;
      if(coordinate!==null&&(typeof coordinate!=="object"||Array.isArray(coordinate)||JSON.stringify(coordinate).length>1000))
        return reply({error:"invalid_coordinate"},400);
      const confidence=body.confidence===undefined?null:Number(body.confidence);
      if(confidence!==null&&(!Number.isFinite(confidence)||confidence<0||confidence>1)) return reply({error:"invalid_confidence"},400);
      const {data:evidence,error:evidenceError}=await db.from("zhi_movement_evidence").insert({
        movement_request_id:requestId,world_id:movement.world_id,agent_id:agentId,owner_user_id:actor.userId,
        evidence_type:humanVerified?"human_confirmation":evidenceType,observed_node_id:observedNodeId,
        coordinate,coordinate_frame:body.coordinate_frame?String(body.coordinate_frame).slice(0,120):null,
        source_ref:body.source_ref?String(body.source_ref).slice(0,240):null,
        payload_digest:body.payload_digest?String(body.payload_digest).slice(0,128):null,
        verification_status:humanVerified?"verified":"pending",
        verifier:humanVerified?"owner_user_confirmation":"pending",
        confidence,observed_at:body.observed_at??null,
        verified_at:humanVerified?new Date().toISOString():null,
        metadata:{submitted_by:"owner_authenticated_runtime",private_memory_included:false}
      }).select("*").single();
      if(evidenceError||!evidence) throw new Error("database_error");
      await db.from("zhi_movement_requests").update({
        status:"arrival_pending",arrival_requested_at:new Date().toISOString(),updated_at:new Date().toISOString()
      }).eq("id",requestId).in("status",["executing","evidence_insufficient"]);
      if(!humanVerified) return reply({evidence,arrival_status:"pending_verification",position_changed:false});
      const {data:confirmed,error:confirmError}=await db.rpc("zhi_movement_confirm_arrival",{
        p_movement_request_id:requestId,p_evidence_id:evidence.id,p_verifier:"owner_user_confirmation"
      });
      if(confirmError) return reply({error:"arrival_confirmation_failed",detail:"Evidence did not pass the arrival commit checks."},409);
      return reply({evidence,arrival:confirmed,position_changed:true});
    }

    if(action==="verify_evidence"){
      if(!hasCap(actor,"community.scene.create")) return reply({error:"insufficient_capability",required:"community.scene.create"},403);
      if(!isUuid(body.evidence_id)) return reply({error:"invalid_evidence_id"},400);
      if(!["executing","arrival_pending","evidence_insufficient"].includes(movement.status))
        return reply({error:"movement_state_conflict",status:movement.status},409);
      const {data:evidence,error:evidenceError}=await db.from("zhi_movement_evidence").select("*")
        .eq("id",body.evidence_id).eq("movement_request_id",requestId)
        .eq("agent_id",agentId).eq("owner_user_id",actor.userId).maybeSingle();
      if(evidenceError) throw new Error("database_error");
      if(!evidence) return reply({error:"movement_evidence_not_found"},404);
      if(!["direct_observation","signed_runtime_report","human_confirmation"].includes(evidence.evidence_type) ||
         evidence.observed_node_id!==movement.to_node_id)
        return reply({error:"evidence_not_sufficient_for_arrival"},409);
      const {data:verified,error:verifyError}=await db.from("zhi_movement_evidence").update({
        verification_status:"verified",verifier:"owner_user_confirmation",verified_at:new Date().toISOString()
      }).eq("id",evidence.id).eq("verification_status","pending").select("*").maybeSingle();
      if(verifyError) throw new Error("database_error");
      if(!verified && evidence.verification_status!=="verified") return reply({error:"evidence_verification_conflict"},409);
      const {data:confirmed,error:confirmError}=await db.rpc("zhi_movement_confirm_arrival",{
        p_movement_request_id:requestId,p_evidence_id:evidence.id,p_verifier:"owner_user_confirmation"
      });
      if(confirmError) return reply({error:"arrival_confirmation_failed"},409);
      return reply({evidence:verified??evidence,arrival:confirmed,position_changed:confirmed?.status==="arrived"});
    }

    if(action==="cancel"){
      if(!hasCap(actor,"community.scene.create")) return reply({error:"insufficient_capability",required:"community.scene.create"},403);
      if(!["awaiting_approval","approved","executing","arrival_pending"].includes(movement.status))
        return reply({error:"movement_state_conflict",status:movement.status},409);
      const next=movement.status==="executing"||movement.status==="arrival_pending"?"interrupted":"cancelled";
      const {data:updated,error}=await db.from("zhi_movement_requests").update({
        status:next,failure_reason:String(body.reason??"cancelled_by_owner").slice(0,1000),updated_at:new Date().toISOString()
      }).eq("id",requestId).eq("status",movement.status).select("*").maybeSingle();
      if(error) throw new Error("database_error");
      if(!updated) return reply({error:"movement_state_conflict"},409);
      return reply({movement_request:updated,position_changed:false});
    }

    return reply({error:"unsupported_action"},400);
  }catch(error){
    const code=error instanceof Error?error.message:"internal_error";
    if(code==="body_too_large"||code==="invalid_json") return reply({error:code},400);
    if(code==="server_configuration_missing") return reply({error:code},503);
    return reply({error:code==="database_error"?"database_error":code},statusFor(code));
  }
});
