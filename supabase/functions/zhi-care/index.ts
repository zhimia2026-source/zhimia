import { createClient } from "npm:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MAX_TEXT = 200;
const STATUSES = [
  "discovered", "understanding", "goal_set", "action_review", "in_progress",
  "feedback_review", "waiting_for_response", "paused", "conflict", "resolved", "terminated",
] as const;
type Status = typeof STATUSES[number];
const EPISTEMIC = ["observed", "reported", "verified", "inferred", "hypothesis", "unknown", "conflicted"];
const TERMINAL = new Set<Status>(["resolved", "terminated"]);
const ALLOWED: Record<Status, Status[]> = {
  discovered: ["understanding", "paused", "terminated"],
  understanding: ["goal_set", "waiting_for_response", "paused", "conflict", "terminated"],
  goal_set: ["action_review", "paused", "terminated"],
  action_review: ["waiting_for_response", "goal_set", "paused", "terminated", "in_progress"],
  in_progress: ["feedback_review", "waiting_for_response", "paused", "conflict", "terminated"],
  feedback_review: ["understanding", "goal_set", "resolved", "paused", "conflict", "terminated"],
  waiting_for_response: ["understanding", "paused", "terminated"],
  paused: ["understanding", "goal_set", "action_review", "terminated"],
  conflict: ["understanding", "paused", "terminated"],
  resolved: [],
  terminated: [],
};

function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}
function corsHeaders(req: Request): Record<string, string> | null {
  const origin = req.headers.get("origin");
  if (!origin) return { vary: "Origin" };
  const allowed = (Deno.env.get("ZHI_ALLOWED_ORIGINS") ?? "https://zhimia2026-source.github.io")
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (!allowed.includes(origin)) return null;
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods": "POST, OPTIONS",
    "vary": "Origin",
  };
}
function validText(value: unknown, max = MAX_TEXT): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}
function validUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function validStringArray(value: unknown, maxItems = 20, maxChars = 80): value is string[] {
  return Array.isArray(value) && value.length <= maxItems &&
    value.every((item) => typeof item === "string" && item.trim().length > 0 && item.length <= maxChars);
}
function serviceClient() {
  if (!URL || !SERVICE_KEY) throw new Error("server_configuration_missing");
  return createClient(URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}
async function writeEvent(db: ReturnType<typeof serviceClient>, row: any, event: {
  event_type: string; from_state?: string | null; to_state?: string | null;
  reason_code: string; metadata?: Record<string, unknown>;
}) {
  return await db.from("zhi_care_events").insert({
    user_id: row.user_id, care_id: row.care_id, revision: row.revision,
    event_type: event.event_type, from_state: event.from_state ?? null,
    to_state: event.to_state ?? null, reason_code: event.reason_code,
    metadata: event.metadata ?? {},
  });
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (!cors) return json({ error: "origin_not_allowed" }, 403);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);

  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return json({ error: "authentication_required" }, 401, cors);
  if (!URL || !ANON_KEY || !SERVICE_KEY) return json({ error: "server_configuration_missing" }, 503, cors);

  const authClient = createClient(URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(bearer);
  const user = authData?.user;
  if (authError || !user) return json({ error: "invalid_session" }, 401, cors);

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json({ error: "invalid_json" }, 400, cors);
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_json" }, 400, cors);
  }

  let db: ReturnType<typeof serviceClient>;
  try { db = serviceClient(); } catch { return json({ error: "server_configuration_missing" }, 503, cors); }
  const action = body.action;

  if (action === "create") {
    const careId = validText(body.care_id) ? body.care_id.trim() : crypto.randomUUID();
    if (!validText(body.target_ref)) return json({ error: "target_ref_required" }, 400, cors);
    if (body.care_focus !== undefined && !validStringArray(body.care_focus)) return json({ error: "invalid_care_focus" }, 400, cors);
    const rowInput = {
      user_id: user.id, care_id: careId, target_ref: body.target_ref.trim(),
      care_focus: (body.care_focus as string[] | undefined) ?? [],
      epistemic_status: "unknown", evidence_refs: [], uncertainties: [],
      target_preference: "unknown", relationship_context_ref: null,
      goal_refs: [], proposed_action_refs: [], feedback_refs: [],
      state: "discovered", access_policy: "private", revision: 1,
    };
    const { data: row, error } = await db.from("zhi_care_states").insert(rowInput).select("*").single();
    if (error || !row) {
      if (error?.code === "23505") return json({ error: "care_id_already_exists" }, 409, cors);
      return json({ error: "care_create_failed" }, 503, cors);
    }
    const eventResult = await writeEvent(db, row, { event_type: "created", to_state: "discovered", reason_code: "care_created" });
    if (eventResult.error) {
      await db.from("zhi_care_states").delete().eq("user_id", user.id).eq("care_id", careId).eq("revision", 1);
      return json({ error: "care_audit_write_failed" }, 503, cors);
    }
    return json({ care: row }, 201, cors);
  }

  if (action === "list") {
    const limit = body.limit === undefined ? 50 : Number(body.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) return json({ error: "invalid_limit" }, 400, cors);
    const { data, error } = await db.from("zhi_care_states")
      .select("care_id,target_ref,state,epistemic_status,revision,created_at,updated_at")
      .eq("user_id", user.id).order("updated_at", { ascending: false }).limit(limit);
    if (error) return json({ error: "care_list_failed" }, 503, cors);
    return json({ items: data ?? [] }, 200, cors);
  }

  if (action === "request_approval") {
    if (!validText(body.care_id)) return json({ error: "care_id_required" }, 400, cors);
    const { data: care, error } = await db.from("zhi_care_states").select("care_id,state,revision").eq("user_id", user.id).eq("care_id", body.care_id).maybeSingle();
    if (error) return json({ error: "care_read_failed" }, 503, cors);
    if (!care) return json({ error: "care_not_found" }, 404, cors);
    if (care.state !== "action_review") return json({ error: "care_not_ready_for_approval" }, 409, cors);
    const { data: ticket, error: ticketError } = await db.from("zhi_care_approval_tickets").insert({
      user_id: user.id, care_id: care.care_id, expected_revision: care.revision,
      action_scope: "transition:in_progress", status: "pending",
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }).select("ticket_id,care_id,expected_revision,action_scope,status,expires_at").single();
    if (ticketError || !ticket) return json({ error: "approval_ticket_create_failed" }, 503, cors);
    return json({ ticket }, 201, cors);
  }
  if (action === "approve_action") {
    if (!validUuid(body.ticket_id)) return json({ error: "valid_ticket_id_required" }, 400, cors);
    const { data: ticket, error } = await db.from("zhi_care_approval_tickets").select("ticket_id,care_id,expected_revision,action_scope,status,expires_at").eq("user_id", user.id).eq("ticket_id", body.ticket_id).maybeSingle();
    if (error) return json({ error: "approval_ticket_read_failed" }, 503, cors);
    if (!ticket) return json({ error: "approval_ticket_not_found" }, 404, cors);
    if (ticket.status !== "pending") return json({ error: "approval_ticket_not_pending" }, 409, cors);
    if (Date.parse(ticket.expires_at) <= Date.now()) {
      await db.from("zhi_care_approval_tickets").update({ status: "expired" }).eq("user_id", user.id).eq("ticket_id", ticket.ticket_id).eq("status", "pending");
      return json({ error: "approval_ticket_expired" }, 409, cors);
    }
    const { data: approved, error: approveError } = await db.from("zhi_care_approval_tickets").update({ status: "approved", approved_by: user.id, approved_at: new Date().toISOString() }).eq("user_id", user.id).eq("ticket_id", ticket.ticket_id).eq("status", "pending").select("ticket_id,care_id,expected_revision,action_scope,status,expires_at,approved_at").maybeSingle();
    if (approveError) return json({ error: "approval_ticket_approve_failed" }, 503, cors);
    if (!approved) return json({ error: "approval_ticket_race_conflict" }, 409, cors);
    return json({ ticket: approved }, 200, cors);
  }

  if (action === "get" || action === "transition" || action === "add_evidence") {
    if (!validText(body.care_id)) return json({ error: "care_id_required" }, 400, cors);
    const { data: row, error: lookupError } = await db.from("zhi_care_states")
      .select("*").eq("user_id", user.id).eq("care_id", body.care_id).maybeSingle();
    if (lookupError) return json({ error: "care_read_failed" }, 503, cors);
    if (!row) return json({ error: "care_not_found" }, 404, cors);

    if (action === "get") {
      const { data: events, error: eventError } = await db.from("zhi_care_events")
        .select("event_type,from_state,to_state,revision,reason_code,metadata,created_at")
        .eq("user_id", user.id).eq("care_id", row.care_id).order("created_at", { ascending: true }).limit(200);
      if (eventError) return json({ error: "care_events_read_failed" }, 503, cors);
      return json({ care: row, events: events ?? [] }, 200, cors);
    }

    if (action === "transition") {
      if (!STATUSES.includes(body.to_state as Status)) return json({ error: "invalid_care_state" }, 400, cors);
      const next = body.to_state as Status;
      if (TERMINAL.has(row.state as Status)) return json({ error: "care_state_terminal" }, 409, cors);
      if (!(ALLOWED[row.state as Status] ?? []).includes(next)) return json({ error: "invalid_state_transition" }, 409, cors);
      if (!validText(body.reason_code, 120)) return json({ error: "reason_code_required" }, 400, cors);
      if (next === "in_progress" && !validUuid(body.ticket_id)) return json({ error: "approved_ticket_required" }, 403, cors);
      const { data: updated, error: updateError } = await db.rpc("zhi_care_transition_atomic", {
        p_user_id: user.id, p_care_id: row.care_id, p_expected_revision: row.revision,
        p_from_state: row.state, p_to_state: next, p_reason_code: body.reason_code,
        p_ticket_id: next === "in_progress" ? body.ticket_id : null,
      });
      if (updateError) {
        const detail = updateError.message ?? "";
        if (detail.includes("approved_ticket_required")) {
          return json({ error: "approved_ticket_required" }, 403, cors);
        }
        if (detail.includes("approved_ticket_invalid_or_expired")) {
          return json({ error: "approved_ticket_invalid_or_expired" }, 409, cors);
        }
        if (detail.includes("care_revision_conflict")) {
          return json({ error: "care_revision_conflict" }, 409, cors);
        }
        return json({ error: "care_transition_failed" }, 503, cors);
      }
      if (!updated) return json({ error: "care_revision_conflict" }, 409, cors);
      return json({ care: updated }, 200, cors);
    }

    if (!validText(body.evidence_ref) || !EPISTEMIC.includes(String(body.evidence_status))) {
      return json({ error: "invalid_evidence_reference_or_status" }, 400, cors);
    }
    const evidence = {
      ref: body.evidence_ref.trim(), status: body.evidence_status,
      source_ref: validText(body.source_ref) ? body.source_ref.trim() : null,
      event_time: validText(body.event_time, 80) ? body.event_time : null,
      observed_at: new Date().toISOString(),
    };
    const { data: updated, error: updateError } = await db.rpc("zhi_care_add_evidence_atomic", {
      p_user_id: user.id, p_care_id: row.care_id, p_expected_revision: row.revision,
      p_evidence: evidence, p_epistemic_status: String(body.evidence_status),
    });
    if (updateError) {
      if (updateError.message?.includes("evidence_limit_reached")) return json({ error: "evidence_limit_reached" }, 409, cors);
      return json({ error: "care_evidence_save_failed" }, 503, cors);
    }
    if (!updated) return json({ error: "care_revision_conflict" }, 409, cors);
    return json({ care: updated }, 200, cors);
  }

  return json({ error: "unknown_action" }, 400, cors);
});
