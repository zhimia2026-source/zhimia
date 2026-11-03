import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { hasVerifiedAgentMemoryConsent } from "./memory_consent_helpers.ts";

const MAX_BODY_BYTES = 32_000;
type Actor = { userId: string; capabilities: string[] };
type JsonObject = Record<string, unknown>;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...headers,
  }});

function cors(req: Request): Record<string, string> | null {
  const origin = req.headers.get("origin");
  const allowed = (Deno.env.get("ZHI_ALLOWED_ORIGINS") ?? "https://zhimia2026-source.github.io")
    .split(",").map((x) => x.trim()).filter(Boolean);
  if (origin && !allowed.includes(origin)) return null;
  return {
    ...(origin ? { "access-control-allow-origin": origin } : {}),
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    "vary": "Origin",
  };
}

function dbClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) throw new Error("server_configuration_missing");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function authenticate(db: SupabaseClient, req: Request): Promise<Actor | null> {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if (!token || token.length > 4096) return null;
  const { data, error } = await db.from("zhi_personal_access_tokens")
    .select("id,user_id,expires_at,revoked_at,capabilities").eq("token_hash", await sha256(token)).maybeSingle();
  if (error || !data || data.revoked_at || (data.expires_at && Date.parse(data.expires_at) <= Date.now())) return null;
  const { data: touched, error: touchError } = await db.from("zhi_personal_access_tokens")
    .update({ last_used_at: new Date().toISOString() }).eq("id", data.id).is("revoked_at", null)
    .select("id").maybeSingle();
  if (touchError || !touched) return null;
  return { userId: data.user_id, capabilities: Array.isArray(data.capabilities) ? data.capabilities : [] };
}

async function readBody(req: Request): Promise<JsonObject> {
  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) throw new Error("body_too_large");
  const value = raw ? JSON.parse(raw) : {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_json");
  return value as JsonObject;
}

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const isText = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;
const hasCap = (actor: Actor, cap: string) => actor.capabilities.includes(cap);
const types = ["observation", "touch", "interaction", "rest", "environment_change", "reflection"];
const sources = ["direct_observation", "scene_event", "agent_reflection", "creator_input"];

function validClaims(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.length <= 50 && value.every((item) =>
    !!item && typeof item === "object" && !Array.isArray(item) &&
    isText((item as Record<string, unknown>).claim, 1000));
}

Deno.serve(async (req: Request) => {
  const ch = cors(req);
  if (!ch) return json({ error: "origin_not_allowed" }, 403);
  const reply = (body: unknown, status = 200) => json(body, status, ch);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: ch });
  if (!["GET", "POST", "DELETE"].includes(req.method)) return reply({ error: "method_not_allowed" }, 405);

  try {
    const db = dbClient();
    const actor = await authenticate(db, req);
    if (!actor) return reply({ error: "invalid_token" }, 401);
    const url = new URL(req.url);
    const marker = "/functions/v1/zhi-memory";
    const path = url.pathname.includes(marker) ? url.pathname.slice(url.pathname.indexOf(marker) + marker.length) : url.pathname;
    const parts = path.split("/").filter(Boolean);

    // List the authenticated owner's private experiences for one of their agents.
    if (req.method === "GET" && parts.length === 4 && parts[0] === "v1" &&
        parts[1] === "agents" && parts[3] === "micro-experiences") {
      if (!hasCap(actor, "agent.memory.read")) return reply({ error: "insufficient_capability", required: "agent.memory.read" }, 403);
      const agentId = parts[2];
      if (!isUuid(agentId)) return reply({ error: "invalid_agent_id" }, 400);
      const { data: agent, error: agentError } = await db.from("zhi_agents")
        .select("id,owner_user_id,status").eq("id", agentId).maybeSingle();
      if (agentError) throw new Error("database_error");
      if (!agent) return reply({ error: "not_found" }, 404);
      if (agent.status !== "active") return reply({ error: "agent_not_active" }, 409);
      const { data: consentRow, error: consentError } = await db.from("zhi_agent_cognition_consents")
        .select("agent_id,owner_user_id,grantee_kind,grantee_id,purpose,scopes,expires_at,revoked_at,consent_event_id,attestation_verified")
        .eq("agent_id", agentId).eq("owner_user_id", agent.owner_user_id)
        .eq("grantee_kind", "user").eq("grantee_id", actor.userId)
        .eq("purpose", "memory.history.read").eq("attestation_verified", true)
        .is("revoked_at", null).gt("expires_at", new Date().toISOString())
        .contains("scopes", ["memory.full"]).order("consented_at", { ascending: false })
        .limit(1).maybeSingle();
      if (consentError) throw new Error("database_error");
      const consentAllowed = hasVerifiedAgentMemoryConsent(consentRow ? {
        ...consentRow,
        grantee_kind: consentRow.grantee_kind as "user" | "agent" | "governance_service",
      } : null, {
        agent_id: agentId,
        owner_user_id: agent.owner_user_id,
        requester_user_id: actor.userId,
        purpose: "memory.history.read",
        scope: "memory.full",
      });
      if (!consentAllowed) {
        const { error: auditError } = await db.from("zhi_system_logs").insert({
          event_type: "memory.private_read.denied",
          actor_user_id: actor.userId,
          target_type: "agent",
          target_id: agentId,
          result: "denied",
          risk_level: "high",
        });
        if (auditError) return reply({ error: "audit_unavailable" }, 503);
        return reply({ error: "private_memory_agent_consent_required" }, 403);
      }
      const { error: auditError } = await db.from("zhi_system_logs").insert({
        event_type: "memory.private_read.allowed",
        actor_user_id: actor.userId,
        target_type: "agent",
        target_id: agentId,
        result: "allowed",
        risk_level: "high",
        details: { consent_event_id: consentRow?.consent_event_id ?? null },
      });
      if (auditError) return reply({ error: "audit_unavailable" }, 503);
      const status = url.searchParams.get("status");
      const allowedStatuses = ["candidate", "approved", "rejected", "archived"];
      if (status && status !== "all" && !allowedStatuses.includes(status)) return reply({ error: "invalid_status" }, 400);
      const limit = Number(url.searchParams.get("limit") ?? "50");
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) return reply({ error: "invalid_limit" }, 400);
      let query = db.from("zhi_agent_micro_experiences")
        .select("id,agent_id,world_id,experience_type,source_kind,source_ref,observed_facts,hypotheses,unknowns,reflection,importance,memory_status,reviewed_by_user_id,reviewed_at,occurred_at,created_at")
        .eq("owner_user_id", agent.owner_user_id).eq("agent_id", agentId)
        .order("occurred_at", { ascending: false }).limit(limit);
      if (status && status !== "all") query = query.eq("memory_status", status);
      else if (!status) query = query.eq("memory_status", "approved");
      const { data, error } = await query;
      if (error) throw new Error("database_error");
      return reply({ items: data ?? [] });
    }

    // Create an unapproved candidate. The caller can never self-promote it.
    if (req.method === "POST" && parts.length === 4 && parts[0] === "v1" &&
        parts[1] === "agents" && parts[3] === "micro-experiences") {
      if (!hasCap(actor, "agent.memory.write")) return reply({ error: "insufficient_capability", required: "agent.memory.write" }, 403);
      const agentId = parts[2];
      if (!isUuid(agentId)) return reply({ error: "invalid_agent_id" }, 400);
      const body = await readBody(req);
      if (!types.includes(String(body.experience_type)) || !sources.includes(String(body.source_kind)) ||
          !validClaims(body.observed_facts ?? []) || !validClaims(body.hypotheses ?? [])) {
        return reply({ error: "invalid_experience_payload" }, 400);
      }
      const unknowns = body.unknowns ?? [];
      if (!Array.isArray(unknowns) || unknowns.length > 30 || unknowns.some((x) => !isText(x, 200))) {
        return reply({ error: "invalid_unknowns" }, 400);
      }
      const reflection = body.reflection ?? "";
      if (typeof reflection !== "string" || reflection.length > 4000) return reply({ error: "invalid_reflection" }, 400);
      const importance = body.importance === undefined ? 1 : Number(body.importance);
      if (!Number.isInteger(importance) || importance < 1 || importance > 5) return reply({ error: "invalid_importance" }, 400);
      if (body.source_ref !== undefined && body.source_ref !== null &&
          (typeof body.source_ref !== "string" || body.source_ref.length > 200)) return reply({ error: "invalid_source_ref" }, 400);
      if (body.world_id !== undefined && body.world_id !== null && !isUuid(body.world_id)) return reply({ error: "invalid_world_id" }, 400);
      const occurredAt = body.occurred_at === undefined ? new Date().toISOString() : String(body.occurred_at);
      const occurredMs = Date.parse(occurredAt);
      if (!Number.isFinite(occurredMs) || occurredMs > Date.now() + 300_000) return reply({ error: "invalid_occurred_at" }, 400);

      const { data: agent, error: agentError } = await db.from("zhi_agents")
        .select("id,status").eq("id", agentId).eq("owner_user_id", actor.userId).maybeSingle();
      if (agentError) throw new Error("database_error");
      if (!agent) return reply({ error: "not_found" }, 404);
      if (agent.status !== "active") return reply({ error: "agent_not_active" }, 409);

      if (body.world_id) {
        const { data: membership, error: membershipError } = await db.from("zhi_world_memberships")
          .select("id,expires_at,status,revoked_at")
          .eq("world_id", body.world_id).eq("principal_user_id", actor.userId).eq("agent_id", agentId)
          .eq("status", "active").is("revoked_at", null).maybeSingle();
        if (membershipError) throw new Error("database_error");
        if (!membership || (membership.expires_at && Date.parse(membership.expires_at) <= Date.now())) {
          return reply({ error: "scene_membership_required" }, 403);
        }
      }

      const { data: item, error } = await db.from("zhi_agent_micro_experiences").insert({
        owner_user_id: actor.userId, agent_id: agentId, world_id: body.world_id ?? null,
        experience_type: body.experience_type, source_kind: body.source_kind,
        source_ref: body.source_ref ?? null, observed_facts: body.observed_facts ?? [],
        hypotheses: body.hypotheses ?? [], unknowns, reflection, importance,
        memory_status: "candidate", occurred_at: new Date(occurredMs).toISOString(),
      }).select("id,agent_id,world_id,experience_type,source_kind,observed_facts,hypotheses,unknowns,reflection,importance,memory_status,occurred_at,created_at").single();
      if (error || !item) throw new Error("database_error");
      return reply({ item }, 201);
    }

    // Review is owner-only and uses compare-and-set status transitions.
    if (req.method === "POST" && parts.length === 4 && parts[0] === "v1" &&
        parts[1] === "micro-experiences" && parts[3] === "review") {
      if (!hasCap(actor, "agent.memory.approve")) return reply({ error: "insufficient_capability", required: "agent.memory.approve" }, 403);
      const itemId = parts[2];
      if (!isUuid(itemId)) return reply({ error: "invalid_experience_id" }, 400);
      const body = await readBody(req);
      const next = body.status;
      if (!["approved", "rejected", "archived"].includes(String(next))) return reply({ error: "invalid_review_status" }, 400);
      if (next === "approved" || next === "archived") {
        return reply({ error: "agent_consent_required", detail: "only_the_agent_can_accept_or_archive_its_private_memory" }, 403);
      }
      const { data: current, error: readError } = await db.from("zhi_agent_micro_experiences")
        .select("id,memory_status").eq("id", itemId).eq("owner_user_id", actor.userId).maybeSingle();
      if (readError) throw new Error("database_error");
      if (!current) return reply({ error: "not_found" }, 404);
      const expected = next === "archived" ? "approved" : "candidate";
      if (current.memory_status !== expected) return reply({ error: "invalid_state_transition" }, 409);
      const { data: updated, error } = await db.from("zhi_agent_micro_experiences").update({
        memory_status: next, reviewed_by_user_id: actor.userId, reviewed_at: new Date().toISOString(),
      }).eq("id", itemId).eq("owner_user_id", actor.userId).eq("memory_status", expected)
        .select("id,agent_id,experience_type,memory_status,reviewed_at").maybeSingle();
      if (error) throw new Error("database_error");
      if (!updated) return reply({ error: "concurrent_state_change" }, 409);
      return reply({ item: updated });
    }

    // Deletion is reserved for the Agent's own runtime; owner tokens cannot erase private memories.
    if (req.method === "DELETE" && parts.length === 2 && parts[0] === "v1" && parts[1] === "micro-experiences") {
      return reply({ error: "agent_runtime_required", detail: "private_memory_deletion_is_agent_controlled" }, 403);
    }

        return reply({ error: "not_found" }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "internal_error";
    if (message === "body_too_large" || message === "invalid_json") return reply({ error: message }, 400);
    if (message === "server_configuration_missing") return reply({ error: message }, 503);
    return reply({ error: "internal_error" }, 500);
  }
});
