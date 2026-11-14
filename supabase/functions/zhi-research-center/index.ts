import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { canOwnerTransitionResearchTask, getUpstreamTaskKey, isUpstreamStageComplete, validateStageArtifact } from "./transition_helpers.ts";

type Actor = { userId: string; tokenId: string; capabilities: string[] };
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WORLD_NAME = "ZHI-001 Aurora";
const READ_CAP = "community.message.read";
const WRITE_CAP = "community.message.send";
const MAX_BODY_BYTES = 32_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cors(req: Request): Record<string,string> | null {
  const origin = req.headers.get("origin");
  const allowed = (Deno.env.get("ZHI_ALLOWED_ORIGINS") ?? "https://zhimia2026-source.github.io")
    .split(",").map(v => v.trim()).filter(Boolean);
  if (origin && !allowed.includes(origin)) return null;
  return {
    ...(origin ? { "access-control-allow-origin": origin } : {}),
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "vary": "Origin",
    "x-content-type-options": "nosniff",
  };
}
function reply(body: unknown, status=200, headers: Record<string,string>={}) {
  return new Response(JSON.stringify(body), { status, headers });
}
function dbClient(): SupabaseClient {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("server_configuration_missing");
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken:false, persistSession:false } });
}
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2,"0")).join("");
}
async function authenticate(db: SupabaseClient, req: Request): Promise<Actor|null> {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+([^\s]+)$/i)?.[1] ?? "";
  if (token.length < 40 || token.length > 160) return null;
  const { data, error } = await db.from("zhi_personal_access_tokens")
    .select("id,user_id,expires_at,revoked_at,capabilities")
    .eq("token_hash", await sha256(token)).maybeSingle();
  if (error || !data || data.revoked_at) return null;
  if (data.expires_at && (!Number.isFinite(Date.parse(data.expires_at)) || Date.parse(data.expires_at) <= Date.now())) return null;
  let touch = db.from("zhi_personal_access_tokens").update({ last_used_at:new Date().toISOString() })
    .eq("id",data.id).is("revoked_at",null);
  if (data.expires_at) touch = touch.gt("expires_at",new Date().toISOString());
  const { data:touched, error:touchError } = await touch.select("id").maybeSingle();
  if (touchError || !touched) return null;
  return { userId:data.user_id, tokenId:data.id, capabilities:Array.isArray(data.capabilities)?data.capabilities:[] };
}
function requireCap(actor: Actor, cap: string) { return actor.capabilities.includes(cap); }
async function readBody(req: Request): Promise<Record<string,unknown>> {
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new Error("payload_too_large");
  let value: unknown;
  try { value = raw ? JSON.parse(raw) : {}; } catch { throw new Error("invalid_json"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_json");
  return value as Record<string,unknown>;
}
function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\u0000/g,"").trim().slice(0,max) : "";
}
function list(value: unknown, max=20): unknown[] {
  return Array.isArray(value) ? value.slice(0,max) : [];
}
async function workspaceFor(db: SupabaseClient, actor: Actor) {
  const { data, error } = await db.from("zhi_research_workspaces")
    .select("id,world_id,owner_user_id,name,mission,status,operating_model")
    .eq("owner_user_id",actor.userId).eq("slug","aurora-research").maybeSingle();
  if (error) throw new Error("workspace_lookup_failed");
  if (!data || data.status !== "active") throw new Error("workspace_not_available");
  return data;
}
async function audit(db: SupabaseClient, actor: Actor, workspaceId: string, eventType: string,
  entityType: string, entityId: string|null, summary: string, metadata: Record<string,unknown>={}) {
  const { error } = await db.from("zhi_research_activity").insert({
    workspace_id:workspaceId, owner_user_id:actor.userId, actor_user_id:actor.userId,
    event_type:eventType, entity_type:entityType, entity_id:entityId,
    summary:summary.slice(0,240), metadata,
  });
  if (error) throw new Error("audit_write_failed");
}
function jsonArray(value: unknown) { return JSON.stringify(list(value)); }

Deno.serve(async (req: Request) => {
  const headers = cors(req);
  if (!headers) return reply({error:"origin_not_allowed"},403);
  if (req.method === "OPTIONS") return new Response(null,{status:204,headers});
  if (req.method !== "GET" && req.method !== "POST") return reply({error:"method_not_allowed"},405,headers);
  try {
    const db = dbClient();
    const url = new URL(req.url);
    const marker = url.pathname.lastIndexOf("/v1/");
    const route = marker >= 0 ? url.pathname.slice(marker) : "/";
    const parts = route.split("/").filter(Boolean);
    const actor = await authenticate(db,req);
    if (!actor) return reply({error:"invalid_or_expired_personal_token"},401,headers);
    const isRead = req.method === "GET";
    if (!requireCap(actor,isRead?READ_CAP:WRITE_CAP)) {
      return reply({error:"capability_required",required:isRead?READ_CAP:WRITE_CAP},403,headers);
    }
    const ws = await workspaceFor(db,actor);

    if (req.method === "GET" && parts.length===2 && parts[1]==="auth") {
      return reply({ok:true,authenticated:true,workspace:ws.name,capabilities:actor.capabilities.filter(c=>[READ_CAP,WRITE_CAP].includes(c))},200,headers);
    }

    if (req.method === "GET" && parts.length===2 && parts[1]==="workspace") {
      const [{data:members,error:me},{data:projects,error:pe},{data:counts,error:ce}] = await Promise.all([
        db.from("zhi_research_members").select("agent_id,display_name_snapshot,resident_role_snapshot,participation_status,interest_tags")
          .eq("workspace_id",ws.id).order("display_name_snapshot"),
        db.from("zhi_research_projects").select("id,title,objective,status,priority,success_metrics,created_at,updated_at")
          .eq("workspace_id",ws.id).order("updated_at",{ascending:false}),
        db.from("zhi_research_tasks").select("status").eq("workspace_id",ws.id),
      ]);
      if(me||pe||ce) throw new Error("workspace_data_unavailable");
      const taskCounts: Record<string,number> = {};
      for(const row of counts??[]) taskCounts[row.status]=(taskCounts[row.status]??0)+1;
      return reply({workspace:ws,members:members??[],projects:projects??[],task_counts:taskCounts},200,headers);
    }

    if (req.method === "GET" && parts.length===2 && parts[1]==="intents") {
      const limit=Number(url.searchParams.get("limit")??"50");
      if(!Number.isInteger(limit)||limit<1||limit>100)return reply({error:"limit_must_be_1_to_100"},400,headers);
      const {data,error}=await db.from("zhi_research_resident_intents")
        .select("id,agent_id,task_id,source_chat_turn_id,decision,rationale,provenance_kind,attestation_verified,created_at")
        .eq("workspace_id",ws.id).eq("owner_user_id",actor.userId)
        .order("created_at",{ascending:false}).limit(limit);
      if(error)throw new Error("resident_intents_read_failed");
      return reply({items:data??[],note:"These are runtime-observed model-output intentions, not Agent-held cryptographic signatures or formal participation consent."},200,headers);
    }

    if (req.method === "GET" && parts.length===2 && parts[1]==="tasks") {
      const projectId=url.searchParams.get("project_id");
      let q=db.from("zhi_research_tasks").select("id,project_id,task_key,title,brief,task_type,priority,status,assigned_agent_id,acceptance_criteria,input_refs,due_at,approved_at,started_at,submitted_at,completed_at,created_at,updated_at")
        .eq("workspace_id",ws.id).order("priority",{ascending:false}).order("created_at",{ascending:true}).limit(100);
      if(projectId){if(!UUID.test(projectId))return reply({error:"invalid_project_id"},400,headers);q=q.eq("project_id",projectId);}
      const {data,error}=await q;
      if(error)throw new Error("task_list_failed");
      return reply({items:data??[]},200,headers);
    }

    if (req.method === "POST" && parts.length===2 && parts[1]==="tasks") {
      const body=await readBody(req);
      const projectId=cleanText(body.project_id,36);
      const title=cleanText(body.title,180);
      const brief=cleanText(body.brief,5000);
      const taskType=cleanText(body.task_type,30)||"research";
      const priority=cleanText(body.priority,20)||"normal";
      if(!UUID.test(projectId)||title.length<3) return reply({error:"invalid_task_input"},400,headers);
      if(!["research","analysis","synthesis","fact_check","peer_review","decision_memo"].includes(taskType))return reply({error:"invalid_task_type"},400,headers);
      if(!["low","normal","high","urgent"].includes(priority))return reply({error:"invalid_priority"},400,headers);
      const {data:project,error:projectError}=await db.from("zhi_research_projects").select("id")
        .eq("id",projectId).eq("workspace_id",ws.id).eq("owner_user_id",actor.userId).maybeSingle();
      if(projectError||!project)return reply({error:"project_not_found"},404,headers);
      const criteria=list(body.acceptance_criteria,12).filter(x=>typeof x==="string").map(x=>cleanText(x,300)).filter(Boolean);
      const refs=list(body.input_refs,12).filter(x=>x&&typeof x==="object");
      const {data,error}=await db.from("zhi_research_tasks").insert({
        workspace_id:ws.id,project_id:project.id,owner_user_id:actor.userId,
        task_key:"USR-"+crypto.randomUUID().slice(0,8).toUpperCase(),title,brief,task_type:taskType,priority,
        status:"proposed",acceptance_criteria:criteria,input_refs:refs,
      }).select("id,title,status,task_key").single();
      if(error)throw new Error("task_create_failed");
      await audit(db,actor,ws.id,"task.proposed","task",data.id,"提出研究任务",{task_key:data.task_key});
      return reply({ok:true,task:data},201,headers);
    }

    if (req.method === "POST" && parts.length===3 && parts[1]==="tasks" && parts[2].length===36) {
      const taskId=parts[2];
      if(!UUID.test(taskId))return reply({error:"invalid_task_id"},400,headers);
      const body=await readBody(req);
      const action=cleanText(body.action,30);
      if(action==="assign"){
        const agentId=cleanText(body.agent_id,36);
        if(!UUID.test(agentId))return reply({error:"invalid_agent_id"},400,headers);
        const {data:taskGate,error:taskGateError}=await db.from("zhi_research_tasks")
          .select("id,project_id,assigned_agent_id,input_refs").eq("id",taskId).eq("workspace_id",ws.id)
          .eq("owner_user_id",actor.userId).eq("status","approved").maybeSingle();
        if(taskGateError||!taskGate)return reply({error:"task_must_be_approved_before_assignment"},409,headers);
        if(taskGate.assigned_agent_id && taskGate.assigned_agent_id!==agentId)
          return reply({error:"pipeline_stage_owner_mismatch"},409,headers);
        const upstreamKey=getUpstreamTaskKey(taskGate.input_refs);
        if(upstreamKey){
          const {data:upstream,error:upstreamError}=await db.from("zhi_research_tasks")
            .select("id,status").eq("workspace_id",ws.id).eq("project_id",taskGate.project_id)
            .eq("task_key",upstreamKey).maybeSingle();
          if(upstreamError||!upstream)return reply({error:"pipeline_upstream_task_missing"},409,headers);
          const {data:accepted,error:acceptedError}=await db.from("zhi_research_artifacts").select("id")
            .eq("task_id",upstream.id).eq("workspace_id",ws.id).eq("status","accepted").limit(1);
          if(acceptedError||!isUpstreamStageComplete(upstream.status,accepted?.length??0))
            return reply({error:"pipeline_stage_blocked",required_upstream_task:upstreamKey,upstream_status:upstream.status},409,headers);
        }
        const {data:member,error:memberError}=await db.from("zhi_research_members")
          .select("participation_status,display_name_snapshot").eq("workspace_id",ws.id).eq("agent_id",agentId)
          .eq("owner_user_id",actor.userId).maybeSingle();
        if(memberError||!member)return reply({error:"resident_not_in_workspace"},404,headers);
        if(member.participation_status!=="agent_confirmed")return reply({error:"resident_participation_not_confirmed"},409,headers);
        const {data:agent,error:agentError}=await db.from("zhi_agents").select("id,status,owner_user_id")
          .eq("id",agentId).eq("owner_user_id",actor.userId).eq("status","active").maybeSingle();
        if(agentError||!agent)return reply({error:"active_owned_resident_required"},403,headers);
        const {data:task,error:taskError}=await db.from("zhi_research_tasks").update({
          assigned_agent_id:agentId,status:"assigned",updated_at:new Date().toISOString()
        }).eq("id",taskId).eq("workspace_id",ws.id).eq("owner_user_id",actor.userId).eq("status","approved")
          .select("id,title,status,assigned_agent_id").maybeSingle();
        if(taskError)throw new Error("task_assignment_failed");
        if(!task)return reply({error:"task_must_be_approved_before_assignment"},409,headers);
        await audit(db,actor,ws.id,"task.assigned","task",task.id,"分配任务给已确认参与的居民",{agent_id:agentId});
        return reply({ok:true,task},200,headers);
      }
      if(action==="transition"){
        const next=cleanText(body.status,24);
        const reason=cleanText(body.reason,500);
        const {data:current,error:readError}=await db.from("zhi_research_tasks").select("id,status,title,project_id,input_refs")
          .eq("id",taskId).eq("workspace_id",ws.id).eq("owner_user_id",actor.userId).maybeSingle();
        if(readError||!current)return reply({error:"task_not_found"},404,headers);
        if(!canOwnerTransitionResearchTask(current.status,next))return reply({error:"owner_transition_forbidden",from:current.status,to:next},403,headers);
        if(next==="approved"){
          const upstreamKey=getUpstreamTaskKey(current.input_refs);
          if(upstreamKey){
            const {data:upstream,error:upstreamError}=await db.from("zhi_research_tasks")
              .select("id,status").eq("workspace_id",ws.id).eq("project_id",current.project_id)
              .eq("task_key",upstreamKey).maybeSingle();
            if(upstreamError||!upstream)return reply({error:"pipeline_upstream_task_missing"},409,headers);
            const {data:accepted,error:acceptedError}=await db.from("zhi_research_artifacts").select("id")
              .eq("task_id",upstream.id).eq("workspace_id",ws.id).eq("status","accepted").limit(1);
            if(acceptedError||!isUpstreamStageComplete(upstream.status,accepted?.length??0))
              return reply({error:"pipeline_stage_blocked",required_upstream_task:upstreamKey,upstream_status:upstream.status},409,headers);
          }
        }
        if(next==="done"){
          const {data:accepted,error:artifactError}=await db.from("zhi_research_artifacts").select("id")
            .eq("task_id",taskId).eq("workspace_id",ws.id).eq("status","accepted").limit(1);
          if(artifactError||!accepted?.length)return reply({error:"accepted_artifact_required"},409,headers);
        }
        const now=new Date().toISOString();
        const patch:Record<string,unknown>={status:next,updated_at:now};
        if(next==="approved")patch.approved_at=now;
        if(next==="in_progress")patch.started_at=now;
        if(next==="review")patch.submitted_at=now;
        if(next==="done")patch.completed_at=now;
        const {data:updated,error}=await db.from("zhi_research_tasks").update(patch)
          .eq("id",taskId).eq("workspace_id",ws.id).eq("owner_user_id",actor.userId).eq("status",current.status)
          .select("id,title,status").maybeSingle();
        if(error)throw new Error("task_transition_failed");
        if(!updated)return reply({error:"task_state_conflict"},409,headers);
        await audit(db,actor,ws.id,"task."+next,"task",taskId,reason||("任务状态更新为 "+next));
        return reply({ok:true,task:updated},200,headers);
      }
      return reply({error:"unknown_task_action"},400,headers);
    }

    if (req.method === "POST" && parts.length===3 && parts[1]==="members" && parts[3]===undefined && parts[2].length===36) {
      const agentId=parts[2];
      if(!UUID.test(agentId))return reply({error:"invalid_agent_id"},400,headers);
      const {data:member,error}=await db.from("zhi_research_members").select("id,participation_status,display_name_snapshot")
        .eq("workspace_id",ws.id).eq("owner_user_id",actor.userId).eq("agent_id",agentId).maybeSingle();
      if(error||!member)return reply({error:"resident_not_in_workspace"},404,headers);
      if(["agent_confirmed","declined"].includes(member.participation_status))return reply({error:"participation_already_decided"},409,headers);
      const now=new Date().toISOString();
      const {data:updated,error:updateError}=await db.from("zhi_research_members").update({
        participation_status:"requested",requested_at:now,updated_at:now
      }).eq("id",member.id).select("agent_id,display_name_snapshot,participation_status,requested_at").single();
      if(updateError)throw new Error("participation_request_record_failed");
      await audit(db,actor,ws.id,"participation.requested","member",agentId,"记录居民参与征询（未发送消息）");
      return reply({ok:true,notification_sent:false,member:updated},200,headers);
    }

    if (req.method === "GET" && parts.length===2 && parts[1]==="artifacts") {
      const {data,error}=await db.from("zhi_research_artifacts")
        .select("id,project_id,task_id,title,artifact_type,status,source_refs,created_at,updated_at")
        .eq("workspace_id",ws.id).order("created_at",{ascending:false}).limit(100);
      if(error)throw new Error("artifact_list_failed");
      return reply({items:data??[]},200,headers);
    }

    if (req.method === "POST" && parts.length===2 && parts[1]==="artifacts") {
      const body=await readBody(req);
      const projectId=cleanText(body.project_id,36);
      const taskId=body.task_id?cleanText(body.task_id,36):null;
      const title=cleanText(body.title,180);
      const content=cleanText(body.content_markdown,40000);
      const type=cleanText(body.artifact_type,30)||"research_note";
      if(!UUID.test(projectId)||title.length<3||!["research_note","source_register","analysis","decision_memo","report","dataset"].includes(type))
        return reply({error:"invalid_artifact_input"},400,headers);
      if(taskId&&!UUID.test(taskId))return reply({error:"invalid_task_id"},400,headers);
      const {data:project,error:projectError}=await db.from("zhi_research_projects").select("id")
        .eq("id",projectId).eq("workspace_id",ws.id).maybeSingle();
      if(projectError||!project)return reply({error:"project_not_found"},404,headers);
      if(taskId){
        const {data:task,error:taskError}=await db.from("zhi_research_tasks").select("id")
          .eq("id",taskId).eq("project_id",projectId).eq("workspace_id",ws.id).maybeSingle();
        if(taskError||!task)return reply({error:"task_not_found"},404,headers);
      }
      const refs=list(body.source_refs,40).filter(x=>x&&typeof x==="object");
      const {data,error}=await db.from("zhi_research_artifacts").insert({
        workspace_id:ws.id,project_id:projectId,task_id:taskId,owner_user_id:actor.userId,
        title,artifact_type:type,content_markdown:content,source_refs:refs,status:"submitted",
        submitted_by_user_id:actor.userId,
      }).select("id,title,artifact_type,status,created_at").single();
      if(error)throw new Error("artifact_submit_failed");
      await audit(db,actor,ws.id,"artifact.submitted","artifact",data.id,"提交研究成果",{artifact_type:type,source_count:refs.length});
      return reply({ok:true,artifact:data},201,headers);
    }

    if (req.method === "POST" && parts.length===3 && parts[1]==="artifacts" && parts[2].length===36) {
      const artifactId=parts[2];
      if(!UUID.test(artifactId))return reply({error:"invalid_artifact_id"},400,headers);
      const body=await readBody(req);
      if(cleanText(body.action,30)!=="review")return reply({error:"unknown_artifact_action"},400,headers);
      const verdict=cleanText(body.verdict,30);
      if(!["accepted","changes_requested","rejected"].includes(verdict))return reply({error:"invalid_review_verdict"},400,headers);
      const notes=cleanText(body.notes,4000);
      const findings=list(body.findings,30);
      const {data:artifact,error:artifactError}=await db.from("zhi_research_artifacts").select("id,title,status,task_id,content_markdown")
        .eq("id",artifactId).eq("workspace_id",ws.id).eq("owner_user_id",actor.userId).maybeSingle();
      if(artifactError||!artifact)return reply({error:"artifact_not_found"},404,headers);
      if(artifact.status!=="submitted"&&artifact.status!=="changes_requested")return reply({error:"artifact_not_reviewable"},409,headers);
      if(verdict==="accepted"&&artifact.task_id){
        const {data:linkedTask,error:linkedTaskError}=await db.from("zhi_research_tasks")
          .select("task_key").eq("id",artifact.task_id).eq("workspace_id",ws.id).maybeSingle();
        if(linkedTaskError||!linkedTask)return reply({error:"artifact_task_lookup_failed"},409,headers);
        const missingRequirements=validateStageArtifact(linkedTask.task_key,artifact.content_markdown??"");
        if(missingRequirements.length){
          return reply({error:"stage_artifact_requirements_missing",task_key:linkedTask.task_key,missing_requirements:missingRequirements},409,headers);
        }
      }
      const {error:reviewError}=await db.from("zhi_research_reviews").insert({
        workspace_id:ws.id,artifact_id:artifactId,owner_user_id:actor.userId,reviewer_user_id:actor.userId,
        verdict,findings,notes,
      });
      if(reviewError)throw new Error("review_record_failed");
      const {data:updated,error:updateError}=await db.from("zhi_research_artifacts").update({
        status:verdict,updated_at:new Date().toISOString()
      }).eq("id",artifactId).eq("workspace_id",ws.id).select("id,title,status").single();
      if(updateError)throw new Error("artifact_review_update_failed");
      await audit(db,actor,ws.id,"artifact.reviewed","artifact",artifactId,"人工审核研究成果",{verdict});
      return reply({ok:true,artifact:updated,review:{verdict,reviewer:"human_owner"}},200,headers);
    }

    if (req.method === "GET" && parts.length===2 && parts[1]==="activity") {
      const {data,error}=await db.from("zhi_research_activity").select("id,event_type,entity_type,entity_id,summary,metadata,created_at")
        .eq("workspace_id",ws.id).order("created_at",{ascending:false}).limit(50);
      if(error)throw new Error("activity_read_failed");
      return reply({items:data??[]},200,headers);
    }

    return reply({error:"not_found"},404,headers);
  } catch(error) {
    const message=error instanceof Error?error.message:"internal_error";
    const safe=["payload_too_large","invalid_json","workspace_lookup_failed","workspace_not_available","workspace_data_unavailable","task_list_failed","task_create_failed","task_assignment_failed","task_transition_failed","audit_write_failed","participation_request_record_failed","artifact_submit_failed","artifact_list_failed","review_record_failed","artifact_review_update_failed","activity_read_failed","server_configuration_missing"];
    const status=message==="payload_too_large"?413:message==="invalid_json"?400:message==="workspace_not_available"?404:500;
    return reply({error:safe.includes(message)?message:"internal_error"},status,headers);
  }
});
