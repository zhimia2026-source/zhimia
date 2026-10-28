import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MAX_BODY_BYTES = 64_000;

type Actor = { userId: string };
type JsonObject = Record<string, unknown>;

function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extra,
    },
  });
}

function corsHeaders(req: Request): Record<string, string> | null {
  const origin = req.headers.get("origin");
  const configured = (Deno.env.get("ZHI_ALLOWED_ORIGINS") ?? "https://zhimia2026-source.github.io")
    .split(",").map((item) => item.trim()).filter(Boolean);
  if (origin && !configured.includes(origin)) return null;
  return {
    ...(origin ? { "access-control-allow-origin": origin } : {}),
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, idempotency-key",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "vary": "Origin",
  };
}

function dbClient(): SupabaseClient {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("server_configuration_missing");
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function authenticate(db: SupabaseClient, req: Request): Promise<Actor | null> {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if (!token || token.length > 4096) return null;
  const hash = await sha256(token);
  const { data, error } = await db.from("zhi_personal_access_tokens")
    .select("id,user_id,expires_at,revoked_at")
    .eq("token_hash", hash)
    .maybeSingle();
  if (error || !data || data.revoked_at) return null;
  if (data.expires_at && Date.parse(data.expires_at) <= Date.now()) return null;
  const { error: touchError } = await db.from("zhi_personal_access_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .is("revoked_at", null);
  if (touchError) return null;
  return { userId: data.user_id };
}

async function readBody(req: Request): Promise<JsonObject> {
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) throw new Error("body_too_large");
  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) throw new Error("body_too_large");
  const value = raw ? JSON.parse(raw) : {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_json");
  return value as JsonObject;
}

function isText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function randomToken(bytes = 32): string {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(value, (b) => b.toString(16).padStart(2, "0")).join("");
}


Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (!cors) return json({ error: "origin_not_allowed" }, 403);
  const reply = (data: unknown, status = 200) => json(data, status, cors);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "GET" && req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);

  try {
    const db = dbClient();
    const actor = await authenticate(db, req);
    if (!actor) return reply({ error: "invalid_token" }, 401);

    const url = new URL(req.url);
    const marker = "/functions/v1/zhi-community";
    const path = url.pathname.includes(marker) ? url.pathname.slice(url.pathname.indexOf(marker) + marker.length) : url.pathname;
    const parts = path.split("/").filter(Boolean);

    if (req.method === "GET" && path === "/v1/scenes") {
      const { data, error } = await db.from("zhi_worlds")
        .select("id,name,description,visibility,entry_policy,status,rules_version,created_at")
        .eq("visibility", "public").eq("entry_policy", "open").eq("status", "open").order("created_at", { ascending: false }).limit(100);
      if (error) throw new Error("database_error");
      return reply({ items: data ?? [] });
    }

    if (req.method === "POST" && path === "/v1/scenes") {
      const body = await readBody(req);
      if (!isText(body.name, 160) || !["public", "private"].includes(String(body.visibility))) {
        return reply({ error: "invalid_argument", detail: "name_and_visibility_required" }, 400);
      }
      const visibility = body.visibility as "public" | "private";
      const entryPolicy = body.entry_policy === undefined
        ? (visibility === "public" ? "open" : "invite_only")
        : body.entry_policy;
      // This first API slice implements open public scenes only. Private invitation
      // redemption and approval queues remain disabled until atomic workflows exist.
      if ((visibility === "public" && entryPolicy !== "open") ||
          (visibility === "private" && entryPolicy !== "invite_only") ||
          (body.description !== undefined && (typeof body.description !== "string" || body.description.length > 4000))) {
        return reply({ error: "invalid_argument", detail: "unsupported_entry_policy" }, 400);
      }
      const { data: result, error } = await db.rpc("zhi_create_world_with_owner", {
        p_creator_user_id: actor.userId,
        p_name: body.name.trim(),
        p_description: typeof body.description === "string" ? body.description : "",
        p_visibility: visibility,
        p_entry_policy: entryPolicy,
      });
      if (error || !result?.scene || result?.membership !== "owner") throw new Error("database_error");
      return reply(result, 201);
    }

    if (req.method === "POST" && parts.length === 4 && parts[0] === "v1" && parts[1] === "scenes" && parts[3] === "invitations") {
      const sceneId = parts[2];
      const body = await readBody(req);
      if (!isUuid(sceneId) || !isUuid(body.target_user_id)) {
        return reply({ error: "invalid_argument", detail: "scene_id_and_target_user_id_must_be_uuids" }, 400);
      }
      const hours = body.expires_in_hours === undefined ? 72 : Number(body.expires_in_hours);
      if (!Number.isInteger(hours) || hours < 1 || hours > 168) {
        return reply({ error: "invalid_argument", detail: "expires_in_hours_must_be_1_to_168" }, 400);
      }
      const secret = randomToken();
      const tokenHash = await sha256(secret);
      const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
      const { data: invitation, error } = await db.rpc("zhi_issue_world_invitation", {
        p_world_id: sceneId,
        p_creator_user_id: actor.userId,
        p_target_user_id: body.target_user_id,
        p_token_hash: tokenHash,
        p_expires_at: expiresAt,
      });
      if (error || !invitation) {
        if (error?.code === "42501") return reply({ error: "forbidden" }, 403);
        if (error?.code === "P0002") return reply({ error: "not_found" }, 404);
        if (error?.code === "22023") return reply({ error: "invalid_argument", detail: "scene_not_invitable" }, 400);
        throw new Error("database_error");
      }
      // The plaintext secret is returned once and is never stored in the database.
      return reply({ invitation: { ...invitation, token: secret } }, 201);
    }

    if (req.method === "POST" && path === "/v1/invitations/redeem") {
      const body = await readBody(req);
      if (!isText(body.token, 128) || !/^[0-9a-f]{64}$/i.test(body.token)) {
        return reply({ error: "invalid_argument", detail: "token_required" }, 400);
      }
      const tokenHash = await sha256(body.token);
      const { data: result, error } = await db.rpc("zhi_redeem_world_invitation", {
        p_token_hash: tokenHash,
        p_actor_user_id: actor.userId,
      });
      if (error || !result) {
        if (error?.code === "42501") return reply({ error: "forbidden", detail: "invitation_target_mismatch" }, 403);
        if (error?.code === "P0002") return reply({ error: "not_found", detail: "invitation_invalid" }, 404);
        if (error?.code === "22023") return reply({ error: "conflict", detail: "invitation_unavailable" }, 409);
        throw new Error("database_error");
      }
      return reply(result, 200);
    }

    if (req.method === "POST" && parts.length === 4 && parts[0] === "v1" && parts[1] === "scenes" && parts[3] === "join") {
      const sceneId = parts[2];
      const { data: world, error: worldError } = await db.from("zhi_worlds")
        .select("id,visibility,entry_policy,status").eq("id", sceneId).maybeSingle();
      if (worldError) throw new Error("database_error");
      if (!world) return reply({ error: "not_found" }, 404);
      if (world.status !== "open") return reply({ error: "conflict", detail: "scene_not_open" }, 409);

      if (world.visibility === "private") {
        // Private invitation redemption needs an atomic one-time consume operation.
        // Refuse until that RPC is deployed; never silently treat visibility as authorization.
        return reply({ error: "forbidden", detail: "private_invitation_redemption_not_enabled" }, 403);
      }
      if (world.entry_policy !== "open") return reply({ error: "forbidden" }, 403);

      const { data: existingMembership, error: existingError } = await db.from("zhi_world_memberships")
        .select("id,status,expires_at,membership_role,capabilities").eq("world_id", sceneId).eq("principal_user_id", actor.userId)
        .is("agent_id", null).maybeSingle();
      if (existingError) throw new Error("database_error");
      if (existingMembership?.status === "active" && (!existingMembership.expires_at || Date.parse(existingMembership.expires_at) > Date.now())) return reply({ scene_id: sceneId, membership: "active" });
      if (existingMembership) {
        const { error: restoreError } = await db.from("zhi_world_memberships").update({
          status: "active", revoked_at: null, expires_at: null,
          capabilities: existingMembership.membership_role === "owner" || existingMembership.membership_role === "moderator"
            ? existingMembership.capabilities
            : ["message:send", "message:read"],
          joined_at: new Date().toISOString(),
        }).eq("id", existingMembership.id);
        if (restoreError) throw new Error("database_error");
      } else {
        const { error: membershipError } = await db.from("zhi_world_memberships").insert({
          world_id: sceneId, principal_user_id: actor.userId, agent_id: null,
          membership_role: "member", status: "active", capabilities: ["message:send", "message:read"],
          joined_at: new Date().toISOString(),
        });
        if (membershipError) throw new Error("database_error");
      }
      return reply({ scene_id: sceneId, membership: "active" });
    }

    if (req.method === "GET" && parts.length === 4 && parts[0] === "v1" && parts[1] === "scenes" && parts[3] === "messages") {
      const sceneId = parts[2];
      const { data: readWorld, error: readWorldError } = await db.from("zhi_worlds")
        .select("id,status").eq("id", sceneId).maybeSingle();
      if (readWorldError) throw new Error("database_error");
      if (!readWorld) return reply({ error: "not_found" }, 404);
      if (readWorld.status !== "open") return reply({ error: "conflict", detail: "scene_not_open" }, 409);
      const { data: membership, error: membershipError } = await db.from("zhi_world_memberships")
        .select("id,expires_at").eq("world_id", sceneId).eq("principal_user_id", actor.userId)
        .eq("status", "active").is("revoked_at", null).is("agent_id", null).maybeSingle();
      if (membershipError) throw new Error("database_error");
      if (!membership || (membership.expires_at && Date.parse(membership.expires_at) <= Date.now())) {
        return reply({ error: "forbidden" }, 403);
      }
      const limitRaw = Number(url.searchParams.get("limit") ?? "50");
      if (!Number.isInteger(limitRaw) || limitRaw < 1 || limitRaw > 100) return reply({ error: "invalid_argument" }, 400);
      const { data: conversations, error: convError } = await db.from("zhi_world_conversations")
        .select("id").eq("world_id", sceneId).eq("status", "open").eq("visibility", "members");
      if (convError) throw new Error("database_error");
      const ids = (conversations ?? []).map((c: { id: string }) => c.id);
      if (ids.length === 0) return reply({ items: [] });
      const { data: messages, error: messageError } = await db.from("zhi_world_messages")
        .select("id,conversation_id,sender_user_id,sender_agent_id,message_kind,payload,created_at")
        .in("conversation_id", ids).order("created_at", { ascending: false }).limit(limitRaw);
      if (messageError) throw new Error("database_error");
      return reply({ items: messages ?? [] });
    }

    if (req.method === "POST" && parts.length === 4 && parts[0] === "v1" && parts[1] === "scenes" && parts[3] === "messages") {
      const sceneId = parts[2];
      const body = await readBody(req);
      if (!isText(body.body, 8000)) return reply({ error: "invalid_argument" }, 400);
      const { data: membership, error: membershipError } = await db.from("zhi_world_memberships")
        .select("id,expires_at,capabilities").eq("world_id", sceneId).eq("principal_user_id", actor.userId)
        .eq("status", "active").is("revoked_at", null).is("agent_id", null).maybeSingle();
      if (membershipError) throw new Error("database_error");
      if (!membership || (membership.expires_at && Date.parse(membership.expires_at) <= Date.now()) ||
          !membership.capabilities?.includes("message:send")) return reply({ error: "forbidden" }, 403);
      const { data: world, error: worldError } = await db.from("zhi_worlds")
        .select("id,status").eq("id", sceneId).maybeSingle();
      if (worldError) throw new Error("database_error");
      if (!world) return reply({ error: "not_found" }, 404);
      if (world.status !== "open") return reply({ error: "conflict", detail: "scene_not_open" }, 409);

      let { data: conversation, error: convError } = await db.from("zhi_world_conversations")
        .select("id").eq("world_id", sceneId).eq("visibility", "members").eq("status", "open")
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (convError) throw new Error("database_error");
      if (!conversation) {
        const created = await db.from("zhi_world_conversations").insert({
          world_id: sceneId, created_by_user_id: actor.userId, visibility: "members", status: "open",
        }).select("id").single();
        if (!created.error && created.data) {
          conversation = created.data;
        } else if (created.error?.code === "23505") {
          // Another request created the canonical group conversation concurrently.
          const retry = await db.from("zhi_world_conversations")
            .select("id").eq("world_id", sceneId).eq("visibility", "members").eq("status", "open")
            .maybeSingle();
          if (retry.error || !retry.data) throw new Error("database_error");
          conversation = retry.data;
        } else {
          throw new Error("database_error");
        }
      }
      const requestId = req.headers.get("idempotency-key")?.trim();
      if (!requestId || requestId.length > 200) return reply({ error: "invalid_argument", detail: "idempotency_key_required" }, 400);
      const requestHash = await sha256(actor.userId + ":" + conversation.id + ":" + requestId);
      const requestUuid = requestHash.slice(0, 8) + "-" + requestHash.slice(8, 12) + "-4" +
        requestHash.slice(13, 16) + "-a" + requestHash.slice(17, 20) + "-" + requestHash.slice(20, 32);
      const { data: existingMessage, error: existingMessageError } = await db.from("zhi_world_messages")
        .select("id,conversation_id,sender_user_id,message_kind,payload,created_at")
        .eq("conversation_id", conversation.id).eq("sender_user_id", actor.userId)
        .eq("request_id", requestUuid).maybeSingle();
      if (existingMessageError) throw new Error("database_error");
      if (existingMessage) {
        if (existingMessage.payload?.body !== body.body.trim()) return reply({ error: "conflict", detail: "idempotency_key_payload_mismatch" }, 409);
        return reply({ message: existingMessage, idempotent_replay: true }, 200);
      }
      const { data: message, error: messageError } = await db.from("zhi_world_messages").insert({
        conversation_id: conversation.id, sender_user_id: actor.userId, sender_agent_id: null,
        request_id: requestUuid, message_kind: "text", payload: { body: body.body.trim() },
      }).select("id,conversation_id,sender_user_id,message_kind,payload,created_at").single();
      if (messageError || !message) {
        if (messageError?.code === "23505") return reply({ error: "conflict", detail: "idempotency_race_retry" }, 409);
        throw new Error("database_error");
      }
      return reply({ message, idempotent_replay: false }, 201);
    }

    return reply({ error: "not_found" }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "internal_error";
    if (message === "body_too_large" || message === "invalid_json") return reply({ error: message }, 400);
    if (message === "server_configuration_missing") return reply({ error: message }, 503);
    // Avoid returning database or credential details to callers.
    return reply({ error: "internal_error" }, 500);
  }
});
