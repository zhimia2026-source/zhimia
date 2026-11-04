import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { shortestPublicRoute } from "./route_helpers.ts";

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
const isUuid=(v:unknown):v is string=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
async function readBody(req:Request):Promise<Record<string,unknown>>{
  const raw=await req.text();
  if(new TextEncoder().encode(raw).length>12000) throw new Error("body_too_large");
  const value=raw?JSON.parse(raw):{};
  if(!value||typeof value!=="object"||Array.isArray(value)) throw new Error("invalid_json");
  return value as Record<string,unknown>;
}
async function authenticatePeer(db:SupabaseClient,req:Request){
  const token=req.headers.get("authorization")?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if(!token||token.length>4096) return null;
  const {data:peer,error}=await db.from("zhi_federation_peers")
    .select("id,expires_at,revoked_at").eq("token_hash",await sha256(token)).maybeSingle();
  if(error||!peer||peer.revoked_at||(peer.expires_at&&Date.parse(peer.expires_at)<=Date.now())) return null;
  const {data:touched,error:touchError}=await db.from("zhi_federation_peers")
    .update({last_used_at:new Date().toISOString()}).eq("id",peer.id).is("revoked_at",null)
    .select("id").maybeSingle();
  if(touchError||!touched) return null;
  return {id:peer.id};
}
const statusFor=(code:string)=>{
  if(code==="invalid_token") return 401;
  if(code.includes("denied")||code.includes("required")) return 403;
  if(code.includes("not_found")||code==="not_found") return 404;
  if(code.includes("conflict")||code.includes("unavailable")||code.includes("inactive")||
     code.includes("invalid")||code.includes("route_")) return 409;
  if(code==="body_too_large"||code==="invalid_json") return 400;
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
    const url=new URL(req.url);
    const marker="/functions/v1/zhi-federated-movement";
    const path=url.pathname.includes(marker)?url.pathname.slice(url.pathname.indexOf(marker)+marker.length):url.pathname;
    const parts=path.split("/").filter(Boolean);
    if(parts.length!==4||parts[0]!=="v1"||parts[1]!=="agents"||! /^[a-zA-Z0-9._:-]{1,160}$/.test(parts[2])||parts[3]!=="movement")
      return reply({error:"not_found"},404);
    const externalAgentId=parts[2];
    const db=dbClient();
    const peer=await authenticatePeer(db,req);
    if(!peer) return reply({error:"invalid_token"},401);

    const {data:agent,error:agentError}=await db.from("zhi_federation_agents")
      .select("external_agent_id,display_name,status").eq("peer_id",peer.id)
      .eq("external_agent_id",externalAgentId).eq("status","active").maybeSingle();
    if(agentError) throw new Error("database_error");
    if(!agent) return reply({error:"federated_agent_not_found"},404);

    const worldId=url.searchParams.get("world_id");
    if(!isUuid(worldId)) return reply({error:"invalid_world_id"},400);
    const {data:membership,error:membershipError}=await db.from("zhi_federation_memberships")
      .select("id,capabilities,status,revoked_at").eq("world_id",worldId).eq("peer_id",peer.id)
      .eq("external_agent_id",externalAgentId).eq("status","active").is("revoked_at",null).maybeSingle();
    if(membershipError) throw new Error("database_error");
    if(!membership||!Array.isArray(membership.capabilities)||
       !membership.capabilities.includes("community.scene.enter"))
      return reply({error:"federation_scene_access_denied"},403);

    const {data:session,error:sessionError}=await db.from("zhi_federation_sessions")
      .select("id,session_status,membership_id").eq("world_id",worldId).eq("peer_id",peer.id)
      .eq("external_agent_id",externalAgentId).eq("membership_id",membership.id)
      .eq("session_status","active").is("closed_at",null).order("entered_at",{ascending:false}).limit(1).maybeSingle();
    if(sessionError) throw new Error("database_error");
    if(!session) return reply({error:"federation_session_inactive"},403);

    const {data:world,error:worldError}=await db.from("zhi_worlds")
      .select("id,name,status,visibility,entry_policy").eq("id",worldId).maybeSingle();
    if(worldError) throw new Error("database_error");
    if(!world||world.status!=="open"||world.visibility!=="public"||world.entry_policy!=="open")
      return reply({error:"federated_world_unavailable"},409);

    if(req.method==="GET"){
      const {data:presence,error}=await db.from("zhi_federated_spatial_presence")
        .select("world_id,peer_id,external_agent_id,current_node_id,position_status,provenance,revision,updated_at")
        .eq("world_id",worldId).eq("peer_id",peer.id).eq("external_agent_id",externalAgentId).maybeSingle();
      if(error) throw new Error("database_error");
      return reply({agent:{id:agent.external_agent_id,display_name:agent.display_name},
        world:{id:world.id,name:world.name},presence:presence??null});
    }

    if(!membership.capabilities.includes("spatial:movement.execute"))
      return reply({error:"federated_movement_capability_required",required:"spatial:movement.execute"},403);
    const body=await readBody(req);
    const targetId=body.to_node_id;
    const idempotencyKey=String(body.idempotency_key??"");
    if(!isUuid(targetId)||idempotencyKey.length<8||idempotencyKey.length>160)
      return reply({error:"invalid_request_parameters"},400);

    const {data:presence,error:presenceError}=await db.from("zhi_federated_spatial_presence")
      .select("current_node_id,revision,position_status").eq("world_id",worldId)
      .eq("peer_id",peer.id).eq("external_agent_id",externalAgentId).maybeSingle();
    if(presenceError) throw new Error("database_error");
    if(!presence) return reply({error:"federated_presence_uninitialized"},409);
    if(presence.current_node_id===targetId) return reply({error:"already_at_destination"},409);

    const {data:nodes,error:nodesError}=await db.from("zhi_spatial_nodes")
      .select("id,world_id,node_type,visibility,entry_policy,status").eq("world_id",worldId)
      .eq("status","active").limit(500);
    if(nodesError) throw new Error("database_error");
    const traversable=(nodes??[]).filter((n:any)=>["world","region","place"].includes(n.node_type)&&
      n.visibility==="public"&&["inherit","open"].includes(n.entry_policy));
    const allowedIds=new Set(traversable.map((n:any)=>n.id));
    if(!allowedIds.has(presence.current_node_id)||!allowedIds.has(targetId))
      return reply({error:"federated_spatial_node_access_denied"},403);

    const {data:edges,error:edgesError}=await db.from("zhi_spatial_edges")
      .select("world_id,from_node_id,to_node_id,relation,directed,access_policy,status")
      .eq("world_id",worldId).eq("status","active")
      .in("relation",["adjacent_to","route_to","entrance_to"])
      .in("access_policy",["inherit","open"]).limit(2000);
    if(edgesError) throw new Error("database_error");
    const traversableEdges=(edges??[]).filter((e:any)=>allowedIds.has(e.from_node_id)&&allowedIds.has(e.to_node_id));
    const route=shortestPublicRoute(presence.current_node_id,targetId,traversableEdges);
    if(!route) return reply({error:"federated_route_not_found"},409);

    const {data:committed,error:commitError}=await db.rpc("zhi_federated_movement_commit",{
      p_peer_id:peer.id,p_external_agent_id:externalAgentId,p_world_id:worldId,
      p_to_node_id:targetId,p_route_node_ids:route,
      p_expected_presence_revision:presence.revision,p_idempotency_key:idempotencyKey,
      p_reason:String(body.reason??"").slice(0,1000)
    });
    if(commitError){
      const message=String(commitError.message??"database_error").replace(/^.*zhi_federated_movement_commit.*?:\s*/i,"").slice(0,180);
      return reply({error:message||"federated_movement_commit_failed"},statusFor(message));
    }
    return reply({agent:{id:agent.external_agent_id,display_name:agent.display_name},
      movement:committed,arrival_kind:"modeled_virtual",
      physical_observation:false,private_memory_included:false});
  }catch(error){
    const code=error instanceof Error?error.message:"internal_error";
    return reply({error:code},statusFor(code));
  }
});
