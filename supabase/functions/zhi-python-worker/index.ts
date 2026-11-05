import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MAX_BODY_BYTES = 64_000;
const WORLD_ID = "50b06c01-060d-49fa-8988-8f38c13406d7";
const REPOSITORY = "zhimia2026-source/zhimia";
const WORKFLOW = "python-worker.yml";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TASK_TYPES = new Set(["healthcheck", "aurora_ecosystem_report"]);

const response = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...headers },
  });
const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
};
function cors(req: Request): Record<string, string> | null {
  const origin = req.headers.get("origin");
  const allowed = (Deno.env.get("ZHI_ALLOWED_ORIGINS") ?? "https://zhimia2026-source.github.io").split(",").map((v) => v.trim()).filter(Boolean);
  if (origin && !allowed.includes(origin)) return null;
  return {
    ...(origin ? { "access-control-allow-origin": origin } : {}),
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, x-zhi-worker-secret",
    "access-control-allow-methods": "POST, OPTIONS",
    "vary": "Origin",
  };
}
async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch { return null; }
}
async function authenticate(db: SupabaseClient, req: Request) {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if (!token || token.length < 40 || token.length > 4096) return null;
  const { data, error } = await db.from("zhi_personal_access_tokens")
    .select("id,user_id,expires_at,revoked_at,capabilities")
    .eq("token_hash", await sha256(token)).maybeSingle();
  if (error || !data || data.revoked_at || (data.expires_at && Date.parse(data.expires_at) <= Date.now())) return null;
  const { data: touched, error: touchError } = await db.from("zhi_personal_access_tokens")
    .update({ last_used_at: new Date().toISOString() }).eq("id", data.id).is("revoked_at", null).select("id").maybeSingle();
  if (touchError || !touched) return null;
  const capabilities = Array.isArray(data.capabilities) ? data.capabilities : [];
  if (!capabilities.includes("tool.execute")) return null;
  return { tokenId: data.id as string, userId: data.user_id as string, capabilities: capabilities as string[] };
}
function isWorker(req: Request): boolean {
  const expected = Deno.env.get("ZHI_PYTHON_WORKER_SECRET") ?? "";
  const supplied = req.headers.get("x-zhi-worker-secret") ?? "";
  return expected.length >= 32 && supplied.length >= 32 && supplied === expected;
}
function dbClient(): SupabaseClient {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("server_configuration_missing");
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}
async function dispatch(jobId: string): Promise<boolean> {
  const token = Deno.env.get("GITHUB_WORKER_DISPATCH_TOKEN") ?? "";
  if (token.length < 20) return false;
  const url = `https://api.github.com/repos/${REPOSITORY}/actions/workflows/${WORKFLOW}/dispatches`;
  const result = await fetch(url, {
    method: "POST",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main", inputs: { job_id: jobId } }),
  });
  return result.status === 204;
}
Deno.serve(async (req: Request) => {
  const headers = cors(req);
  if (!headers) return response({ error: "origin_not_allowed" }, 403);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return response({ error: "method_not_allowed" }, 405, headers);
  if (!SUPABASE_URL || !SERVICE_KEY) return response({ error: "server_configuration_missing" }, 503, headers);
  const body = await readBody(req);
  if (!body) return response({ error: "invalid_or_oversized_json" }, 400, headers);
  const action = String(body.action ?? "");
  const db = dbClient();

  // GitHub Actions worker callbacks use a dedicated shared secret, never an Agent token.
  if (["claim_job", "complete_job", "fail_job"].includes(action)) {
    if (!isWorker(req)) return response({ error: "worker_authentication_failed" }, 401, headers);
    const jobId = String(body.job_id ?? "");
    if (!UUID.test(jobId)) return response({ error: "job_id_must_be_uuid" }, 400, headers);
    if (action === "claim_job") {
      const { data, error } = await db.from("zhi_python_jobs")
        .update({ status: "running", started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", jobId).eq("status", "queued")
        .select("id,agent_id,task_type,input,permission_scope,execution_limits").maybeSingle();
      if (error) return response({ error: "job_claim_failed" }, 503, headers);
      if (!data) return response({ error: "job_not_queued_or_already_claimed" }, 409, headers);
      return response({ ok: true, job: { task_id: data.id, agent_id: data.agent_id, workspace_id: data.id, task_type: data.task_type, input: data.input, permission_scope: data.permission_scope, execution_limits: data.execution_limits } }, 200, headers);
    }
    if (action === "complete_job") {
      const result = body.result;
      if (!result || typeof result !== "object" || Array.isArray(result)) return response({ error: "result_must_be_object" }, 400, headers);
      const { data, error } = await db.from("zhi_python_jobs")
        .update({ status: "completed", result, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", jobId).eq("status", "running").select("id,status,completed_at").maybeSingle();
      if (error) return response({ error: "job_completion_failed" }, 503, headers);
      if (!data) return response({ error: "job_not_running" }, 409, headers);
      return response({ ok: true, job: data }, 200, headers);
    }
    const errorCode = typeof body.error_code === "string" && /^[a-z0-9_]{1,80}$/.test(body.error_code) ? body.error_code : "worker_execution_failed";
    const { data, error } = await db.from("zhi_python_jobs")
      .update({ status: "failed", error_code: errorCode, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", jobId).eq("status", "running").select("id,status,error_code").maybeSingle();
    if (error) return response({ error: "job_failure_record_failed" }, 503, headers);
    if (!data) return response({ error: "job_not_running" }, 409, headers);
    return response({ ok: true, job: data }, 200, headers);
  }

  const actor = await authenticate(db, req);
  if (!actor) return response({ error: "invalid_token_or_tool_execute_capability_required" }, 401, headers);

  if (action === "create_job") {
    const agentId = String(body.agent_id ?? "");
    const taskType = String(body.task_type ?? "");
    if (!UUID.test(agentId)) return response({ error: "agent_id_must_be_uuid" }, 400, headers);
    if (!TASK_TYPES.has(taskType)) return response({ error: "task_type_not_allowlisted" }, 400, headers);
    const { data: agent, error: agentError } = await db.from("zhi_agents")
      .select("id,owner_user_id,status,display_name").eq("id", agentId).eq("owner_user_id", actor.userId).maybeSingle();
    if (agentError) return response({ error: "agent_lookup_failed" }, 503, headers);
    if (!agent || agent.status !== "active") return response({ error: "owned_active_agent_required" }, 404);

    let input: Record<string, unknown> = {};
    let scope: string[] = [];
    if (taskType === "aurora_ecosystem_report") {
      const worldId = String(body.world_id ?? WORLD_ID);
      if (!UUID.test(worldId)) return response({ error: "world_id_must_be_uuid" }, 400, headers);
      const [{ data: world, error: worldError }, { data: membership, error: membershipError }] = await Promise.all([
        db.from("zhi_worlds").select("id,status,visibility,entry_policy").eq("id", worldId).maybeSingle(),
        db.from("zhi_world_memberships").select("status,capabilities,expires_at,revoked_at")
          .eq("world_id", worldId).eq("agent_id", agentId).eq("principal_user_id", actor.userId).maybeSingle(),
      ]);
      if (worldError || membershipError) return response({ error: "world_authorization_lookup_failed" }, 503, headers);
      const membershipCaps = Array.isArray(membership?.capabilities) ? membership.capabilities : [];
      if (!world || world.status !== "open" || world.visibility !== "public" || world.entry_policy !== "open" ||
          !membership || membership.status !== "active" || membership.revoked_at ||
          (membership.expires_at && Date.parse(membership.expires_at) <= Date.now()) ||
          !membershipCaps.includes("spatial:perception.read")) {
        return response({ error: "active_public_world_perception_membership_required" }, 403, headers);
      }
      const { data: events, error: eventError } = await db.from("zhi_ecosystem_events")
        .select("event_kind,occurred_at,causal_chain")
        .eq("world_id", worldId).order("occurred_at", { ascending: false }).limit(100);
      if (eventError) return response({ error: "ecosystem_events_unavailable" }, 503, headers);
      input = { world_id: worldId, events: (events ?? []).map((event: Record<string, unknown>) => ({
        event_kind: event.event_kind,
        occurred_at: event.occurred_at,
        causal_chain: event.causal_chain,
      })) };
      scope = ["aurora.events.read"];
    }
    const limits = { timeout_seconds: 10, max_input_bytes: 128000, max_events: 1000 };
    const { data: job, error: insertError } = await db.from("zhi_python_jobs").insert({
      owner_user_id: actor.userId, agent_id: agentId, task_type: taskType, input,
      permission_scope: scope, execution_limits: limits, status: "proposed",
    }).select("id,agent_id,task_type,status,permission_scope,created_at").single();
    if (insertError || !job) return response({ error: "job_create_failed" }, 503, headers);
    return response({ ok: true, job, approval_required: true }, 201, headers);
  }

  if (action === "approve_job") {
    const jobId = String(body.job_id ?? "");
    if (!UUID.test(jobId)) return response({ error: "job_id_must_be_uuid" }, 400, headers);
    if ((Deno.env.get("GITHUB_WORKER_DISPATCH_TOKEN") ?? "").length < 20 ||
        (Deno.env.get("ZHI_PYTHON_WORKER_SECRET") ?? "").length < 32) {
      return response({ error: "worker_dispatch_secrets_not_configured" }, 503, headers);
    }
    const { data: approved, error: approveError } = await db.from("zhi_python_jobs")
      .update({ status: "queued", approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", jobId).eq("owner_user_id", actor.userId).eq("status", "proposed")
      .select("id,agent_id,task_type,status").maybeSingle();
    if (approveError) return response({ error: "job_approval_failed" }, 503, headers);
    if (!approved) return response({ error: "owned_proposed_job_required" }, 404, headers);
    if (!await dispatch(jobId)) {
      await db.from("zhi_python_jobs").update({ status: "proposed", approved_at: null, updated_at: new Date().toISOString() })
        .eq("id", jobId).eq("status", "queued");
      return response({ error: "github_workflow_dispatch_failed" }, 502, headers);
    }
    return response({ ok: true, job: approved, dispatched: true }, 200, headers);
  }

  if (action === "get_job") {
    const jobId = String(body.job_id ?? "");
    if (!UUID.test(jobId)) return response({ error: "job_id_must_be_uuid" }, 400, headers);
    const { data, error } = await db.from("zhi_python_jobs")
      .select("id,agent_id,task_type,status,permission_scope,result,error_code,created_at,approved_at,started_at,completed_at")
      .eq("id", jobId).eq("owner_user_id", actor.userId).maybeSingle();
    if (error) return response({ error: "job_read_failed" }, 503, headers);
    if (!data) return response({ error: "not_found" }, 404, headers);
    return response({ ok: true, job: data }, 200, headers);
  }

  return response({ error: "unknown_action" }, 400, headers);
});
