import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

type Actor = { userId: string; capabilities: string[] };
const corsHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "https://zhimia2026-source.github.io",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "GET, POST, PUT, OPTIONS",
  "vary": "Origin",
};

function reply(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, ...headers } });
}
function dbClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) throw new Error("server_configuration_missing");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}
async function authenticate(db: SupabaseClient, req: Request): Promise<Actor | null> {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if (!token || token.length < 40 || token.length > 4096) return null;
  const tokenHash = await sha256(token);
  const { data, error } = await db.from("zhi_personal_access_tokens")
    .select("id,user_id,expires_at,revoked_at,capabilities")
    .eq("token_hash", tokenHash).maybeSingle();
  if (error || !data || data.revoked_at) return null;
  if (data.expires_at && (!Number.isFinite(Date.parse(data.expires_at)) || Date.parse(data.expires_at) <= Date.now())) return null;
  let touchQuery = db.from("zhi_personal_access_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id).is("revoked_at", null);
  if (data.expires_at) touchQuery = touchQuery.gt("expires_at", new Date().toISOString());
  const { data: touched, error: touchError } = await touchQuery.select("id").maybeSingle();
  if (touchError || !touched) return null;
  return { userId: data.user_id, capabilities: Array.isArray(data.capabilities) ? data.capabilities : [] };
}
function has(actor: Actor, capability: string) { return actor.capabilities.includes(capability); }
async function ownedAgent(db: SupabaseClient, actor: Actor, agentId: string) {
  const { data, error } = await db.from("zhi_agents")
    .select("id,owner_user_id,display_name,status")
    .eq("id", agentId).eq("owner_user_id", actor.userId).maybeSingle();
  if (error) throw new Error("database_error");
  return data;
}
async function readBody(req: Request): Promise<Record<string, unknown>> {
  const raw = await req.text();
  if (raw.length > 16000) throw new Error("payload_too_large");
  const parsed = raw ? JSON.parse(raw) : {};
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_json");
  return parsed as Record<string, unknown>;
}
function normList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((x): x is string => typeof x === "string")
    .map(x => x.trim().toLowerCase()).filter(x => x.length > 0 && x.length <= 64))].slice(0, 30);
}
function manifestInterests(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const manifest = value as Record<string, unknown>;
  const declared = normList(manifest.interests);
  if (declared.length) return declared;
  const personality = manifest.personality && typeof manifest.personality === "object" && !Array.isArray(manifest.personality)
    ? manifest.personality as Record<string, unknown> : {};
  return normList([
    ...(Array.isArray(personality.traits) ? personality.traits : []),
    ...(Array.isArray(personality.capability_layer) ? personality.capability_layer : []),
  ]);
}
function eventText(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return Object.entries(value as Record<string, unknown>).slice(0, 20)
    .map(([k, v]) => k + " " + (typeof v === "string" ? v : JSON.stringify(v))).join(" ").toLowerCase().slice(0, 2000);
}
function overlap(a: string[], b: string[]) {
  const setB = new Set(b);
  const matched = a.filter(x => setB.has(x));
  const union = new Set([...a, ...b]).size;
  return { ratio: union ? matched.length / union : 0, matched };
}
async function evaluateAgent(db: SupabaseClient, agentId: string, ownerUserId: string, onlyWorldId?: string) {
  const now = new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { data: profile, error: profileError } = await db.from("zhi_social_profiles")
    .select("*").eq("agent_id", agentId).eq("owner_user_id", ownerUserId).maybeSingle();
  if (profileError) throw new Error("social_profile_unavailable");
  if (!profile || !profile.enabled || profile.daily_initiation_limit <= 0) return { agent_id: agentId, queued: 0, reason: "disabled" };

  let membershipQuery = db.from("zhi_world_memberships")
    .select("world_id,principal_user_id,expires_at")
    .eq("agent_id", agentId).eq("principal_user_id", ownerUserId)
    .eq("status", "active").is("revoked_at", null);
  if (onlyWorldId) membershipQuery = membershipQuery.eq("world_id", onlyWorldId);
  const { data: memberships, error: membershipError } = await membershipQuery;
  if (membershipError) throw new Error("membership_unavailable");

  let queued = 0;
  for (const membership of memberships ?? []) {
    if (membership.expires_at && Date.parse(membership.expires_at) <= now.getTime()) continue;
    const worldId = membership.world_id;
    const { data: world, error: worldError } = await db.from("zhi_worlds")
      .select("id,status").eq("id", worldId).maybeSingle();
    if (worldError) throw new Error("world_unavailable");
    if (!world || world.status !== "open") continue;

    const { data: peerMemberships, error: peersError } = await db.from("zhi_world_memberships")
      .select("agent_id,principal_user_id,expires_at")
      .eq("world_id", worldId).eq("status", "active").is("revoked_at", null)
      .not("agent_id", "is", null);
    if (peersError) throw new Error("peer_memberships_unavailable");
    const peerIds = [...new Set((peerMemberships ?? [])
      .filter(m => m.agent_id && m.agent_id !== agentId && (!m.expires_at || Date.parse(m.expires_at) > now.getTime()))
      .map(m => m.agent_id as string))];
    if (!peerIds.length) continue;

    const { data: peers, error: peerError } = await db.from("zhi_agents")
      .select("id,owner_user_id,display_name,status,public_manifest")
      .in("id", peerIds).eq("status", "active");
    if (peerError) throw new Error("peer_agents_unavailable");
    const verifiedPeers = (peers ?? []).filter(p =>
      p.display_name !== "MIA" &&
      (peerMemberships ?? []).some(m => m.agent_id === p.id && m.principal_user_id === p.owner_user_id)
    );

    const [{ data: relationships, error: relError }, { data: events, error: eventError }, { data: presence, error: presenceError }] = await Promise.all([
      db.from("zhi_social_relationships").select("*")
        .eq("observer_agent_id", agentId).eq("owner_user_id", ownerUserId).eq("world_id", worldId),
      db.from("zhi_ecosystem_events").select("id,event_kind,payload,occurred_at")
        .eq("world_id", worldId).gte("occurred_at", since)
        .order("occurred_at", { ascending: false }).limit(30),
      db.from("zhi_spatial_presence").select("agent_id,current_node_id,position_status,last_confirmed_at,confidence")
        .eq("world_id", worldId).eq("position_status", "confirmed")
        .gte("last_confirmed_at", new Date(now.getTime() - 2 * 3600000).toISOString())
        .not("current_node_id", "is", null),
    ]);
    if (relError) throw new Error("relationship_unavailable");
    if (eventError) throw new Error("world_events_unavailable");
    const relationByPeer = new Map((relationships ?? []).map(r => [r.peer_agent_id, r]));
    const nodeByAgent = new Map((presenceError ? [] : presence ?? []).map(p => [p.agent_id, p.current_node_id]));
    const ownInterests = normList(profile.interests);
    const recentEvents = events ?? [];

    const { count: todayCount, error: countError } = await db.from("zhi_social_intents")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agentId).eq("world_id", worldId).neq("reason_code", "reply_to_message")
      .gte("created_at", new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString())
      .in("status", ["pending", "deferred", "accepted", "completed"]);
    if (countError) throw new Error("intent_count_unavailable");
    let remaining = Math.max(0, Number(profile.daily_initiation_limit) - (todayCount ?? 0));
    if (remaining <= 0) continue;

    const sentSince = new Date(now.getTime() - Number(profile.peer_cooldown_hours) * 3600000).toISOString();
    const { data: worldConversations, error: conversationsError } = await db.from("zhi_world_conversations")
      .select("id").eq("world_id", worldId).eq("status", "open");
    if (conversationsError) throw new Error("world_conversations_unavailable");
    const conversationIds = (worldConversations ?? []).map(c => c.id);
    const { data: recentSent, error: sentError } = conversationIds.length
      ? await db.from("zhi_world_messages").select("payload")
          .eq("sender_agent_id", agentId).in("conversation_id", conversationIds)
          .gte("created_at", sentSince).limit(100)
      : { data: [], error: null };
    if (sentError) throw new Error("recent_messages_unavailable");
    const recentPeers = new Set((recentSent ?? []).map(m => (m.payload as Record<string, unknown>)?.recipient_agent_id).filter(Boolean));

    const candidates: Array<{ peer: any; score: number; reason: string; context: Record<string, unknown> }> = [];
    for (const peer of verifiedPeers) {
      const rel = relationByPeer.get(peer.id);
      if (rel?.next_contact_after && Date.parse(rel.next_contact_after) > now.getTime()) continue;
      if (recentPeers.has(peer.id)) continue;

      const peerInterests = manifestInterests(peer.public_manifest);
      const interest = overlap(ownInterests, peerInterests);
      const eventMatches = recentEvents.filter(e => {
        const text = String(e.event_kind ?? "").toLowerCase() + " " + eventText(e.payload);
        return ownInterests.some(topic => text.includes(topic));
      });
      const samePlace = Boolean(nodeByAgent.get(agentId) && nodeByAgent.get(agentId) === nodeByAgent.get(peer.id));
      // A fresh event can trigger first contact when residents share an explicit topic,
      // or when they have a recently confirmed co-presence. Inferred/stale positions never count.
      const sharedWorldEvent = samePlace && recentEvents.length > 0;
      const sharedTopicEvent = interest.matched.length > 0 && recentEvents.length > 0;
      const eventOpportunity = sharedWorldEvent || sharedTopicEvent;
      const novelty = eventMatches.length || eventOpportunity ? 100 : 0;
      const familiarity = Math.max(0, Math.min(100, Number(rel?.familiarity_score ?? 0)));
      const sharedTopics = normList(rel?.shared_topics);
      const collaboration = eventOpportunity
        ? 100
        : Math.min(100, interest.ratio * 60 + Math.min(40, sharedTopics.length * 20));
      const interestValue = interest.matched.length > 0 ? 100 : sharedWorldEvent ? 100 : 0;
      const timing = samePlace || sharedTopicEvent ? 100 : 50;
      const score = Math.round((interestValue * 0.25 + familiarity * 0.20 + novelty * 0.20 + collaboration * 0.20 + timing * 0.15) * 100) / 100;
      if (score < Number(profile.minimum_score)) continue;
      const reason = eventMatches.length || eventOpportunity ? "world_event" : interest.matched.length ? "shared_interest" :
        samePlace ? "co_presence" : "relationship";
      const relevantEvents = eventMatches.length ? eventMatches : eventOpportunity ? recentEvents : [];
      candidates.push({
        peer, score, reason,
        context: {
          matched_public_topics: interest.matched,
          relevant_world_event_ids: relevantEvents.slice(0, 5).map(e => e.id),
          relevant_event_kinds: [...new Set(relevantEvents.map(e => e.event_kind))].slice(0, 5),
          co_present: samePlace,
          relationship_state: rel?.relationship_state ?? "acquaintance",
        },
      });
    }
    candidates.sort((a, b) => b.score - a.score);
    for (const candidate of candidates.slice(0, remaining)) {
      const idempotencyKey = await sha256(worldId + ":" + agentId + ":" + candidate.peer.id + ":" + now.toISOString().slice(0, 10));
      const { error: insertError } = await db.from("zhi_social_intents").upsert({
        world_id: worldId, agent_id: agentId, owner_user_id: ownerUserId,
        peer_agent_id: candidate.peer.id, trigger_kind: candidate.reason,
        reason_code: candidate.reason, value_score: candidate.score,
        context: candidate.context, status: "pending",
        not_before: now.toISOString(), expires_at: new Date(now.getTime() + 7 * 86400000).toISOString(),
        idempotency_key: idempotencyKey,
      }, { onConflict: "idempotency_key", ignoreDuplicates: true });
      if (insertError) throw new Error("social_intent_queue_failed");
      queued++;
    }
  }
  await db.from("zhi_social_profiles").update({ last_evaluated_at: now.toISOString(), updated_at: now.toISOString() })
    .eq("agent_id", agentId).eq("owner_user_id", ownerUserId);
  return { agent_id: agentId, queued, reason: "evaluated" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const db = dbClient();
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);

    if (req.method === "POST" && parts.length === 1 && parts[0] === "internal-evaluate") {
      const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      if (!key || bearer !== key) return reply({ error: "unauthorized" }, 401);
      const body = await readBody(req);
      const worldId = typeof body.world_id === "string" ? body.world_id : undefined;
      const { data: profiles, error } = await db.from("zhi_social_profiles")
        .select("agent_id,owner_user_id").eq("enabled", true).limit(200);
      if (error) throw new Error("profiles_unavailable");
      const results = [];
      for (const p of profiles ?? []) results.push(await evaluateAgent(db, p.agent_id, p.owner_user_id, worldId));
      return reply({ ok: true, evaluated: results.length, results });
    }

    const match = url.pathname.match(/^\/v1\/agents\/([0-9a-f-]{36})\/social(?:\/(.*))?$/i);
    if (!match) return reply({ error: "not_found" }, 404);
    const agentId = match[1];
    const tail = match[2] ?? "";
    const actor = await authenticate(db, req);
    if (!actor) return reply({ error: "unauthorized" }, 401);
    const agent = await ownedAgent(db, actor, agentId);
    if (!agent || agent.status !== "active" || agent.display_name === "MIA") return reply({ error: "agent_not_found" }, 404);

    if (tail === "profile" && req.method === "GET") {
      if (!has(actor, "agent.memory.read")) return reply({ error: "capability_required" }, 403);
      const { data, error } = await db.from("zhi_social_profiles").select("*")
        .eq("agent_id", agentId).eq("owner_user_id", actor.userId).maybeSingle();
      if (error) throw new Error("profile_read_failed");
      return reply({ profile: data });
    }

    if (tail === "profile" && req.method === "PUT") {
      if (!has(actor, "agent.memory.write")) return reply({ error: "capability_required" }, 403);
      const body = await readBody(req);
      const interests = normList(body.interests);
      const style = ["selective", "reserved", "curious", "collaborative"].includes(String(body.social_style))
        ? String(body.social_style) : "selective";
      const { data, error } = await db.from("zhi_social_profiles").upsert({
        agent_id: agentId, owner_user_id: actor.userId,
        enabled: body.enabled !== false, interests, social_style: style,
        daily_initiation_limit: Math.max(0, Math.min(5, Number(body.daily_initiation_limit ?? 2))),
        peer_cooldown_hours: Math.max(12, Math.min(168, Number(body.peer_cooldown_hours ?? 36))),
        minimum_score: Math.max(50, Math.min(100, Number(body.minimum_score ?? 80))),
        last_evaluated_at: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "agent_id" }).select("*").single();
      if (error || !data) throw new Error("profile_write_failed");
      return reply({ profile: data });
    }

    if (tail === "inbox" && req.method === "GET") {
      if (!has(actor, "community.message.read")) return reply({ error: "capability_required" }, 403);
      const { data: profile, error: profileError } = await db.from("zhi_social_profiles")
        .select("last_evaluated_at").eq("agent_id", agentId).eq("owner_user_id", actor.userId).maybeSingle();
      if (profileError) throw new Error("profile_read_failed");
      const last = profile?.last_evaluated_at ? Date.parse(profile.last_evaluated_at) : 0;
      if (!last || Date.now() - last >= 24 * 3600000) {
        await evaluateAgent(db, agentId, actor.userId);
      }
      const { data, error } = await db.from("zhi_social_intents").select(
        "id,world_id,peer_agent_id,trigger_kind,reason_code,value_score,context,status,not_before,expires_at,created_at"
      ).eq("agent_id", agentId).eq("owner_user_id", actor.userId)
        .in("status", ["pending", "deferred", "accepted"]).lte("not_before", new Date().toISOString())
        .gt("expires_at", new Date().toISOString()).order("value_score", { ascending: false }).limit(10);
      if (error) throw new Error("inbox_read_failed");
      return reply({ items: data ?? [], evaluated_on_wake: true });
    }

    if (tail.startsWith("intents/") && req.method === "POST") {
      if (!has(actor, "community.message.send")) return reply({ error: "capability_required" }, 403);
      const intentId = tail.split("/")[1];
      const body = await readBody(req);
      const action = String(body.action ?? "");
      if (!["accept", "defer", "ignore", "complete"].includes(action)) return reply({ error: "invalid_action" }, 400);
      const { data: intent, error: intentError } = await db.from("zhi_social_intents").select("*")
        .eq("id", intentId).eq("agent_id", agentId).eq("owner_user_id", actor.userId).maybeSingle();
      if (intentError) throw new Error("intent_read_failed");
      if (!intent) return reply({ error: "intent_not_found" }, 404);
      if (action === "complete" && intent.status === "completed") return reply({ intent: { id: intentId, status: "completed" }, idempotent_replay: true });
      if ((action === "complete" && intent.status !== "accepted") ||
          (action !== "complete" && !["pending", "deferred"].includes(intent.status))) {
        if (action === "accept" && intent.status === "accepted") return reply({ intent: { id: intentId, status: "accepted" }, idempotent_replay: true });
        if (action === "defer" && intent.status === "deferred") return reply({ intent: { id: intentId, status: "deferred" }, idempotent_replay: true });
        if (action === "ignore" && intent.status === "ignored") return reply({ intent: { id: intentId, status: "ignored" }, idempotent_replay: true });
        return reply({ error: "intent_state_conflict" }, 409);
      }
      let verifiedMessage: Record<string, any> | null = null;
      if (action === "complete") {
        const { data: conversations, error: conversationsError } = await db.from("zhi_world_conversations")
          .select("id").eq("world_id", intent.world_id).eq("status", "open");
        if (conversationsError) throw new Error("world_conversations_unavailable");
        const conversationIds = (conversations ?? []).map(c => c.id);
        if (!conversationIds.length) return reply({ error: "message_not_found_for_intent" }, 409);
        const { data: sentMessages, error: sentError } = await db.from("zhi_world_messages")
          .select("id,conversation_id,payload,created_at").eq("sender_agent_id", agentId).in("conversation_id", conversationIds)
          .gte("created_at", intent.created_at).limit(100);
        if (sentError) throw new Error("message_verification_failed");
        verifiedMessage = (sentMessages ?? []).find(m =>
          (m.payload as Record<string, unknown>)?.recipient_agent_id === intent.peer_agent_id
        ) ?? null;
        if (!verifiedMessage) return reply({ error: "message_not_found_for_intent" }, 409);
        const now = new Date();
        const { data: profile } = await db.from("zhi_social_profiles").select("peer_cooldown_hours")
          .eq("agent_id", agentId).maybeSingle();
        const { data: existing } = await db.from("zhi_social_relationships").select("id,familiarity_score,shared_experience_count")
          .eq("world_id", intent.world_id).eq("observer_agent_id", agentId).eq("peer_agent_id", intent.peer_agent_id).maybeSingle();
        const { error: relationError } = await db.from("zhi_social_relationships").upsert({
          world_id: intent.world_id, observer_agent_id: agentId, owner_user_id: actor.userId,
          peer_agent_id: intent.peer_agent_id, relationship_state: "developing",
          familiarity_score: Math.min(100, Number(existing?.familiarity_score ?? 0) + 5),
          shared_experience_count: Number(existing?.shared_experience_count ?? 0) + 1,
          last_contact_at: now.toISOString(),
          next_contact_after: new Date(now.getTime() + Number(profile?.peer_cooldown_hours ?? 36) * 3600000).toISOString(),
          updated_at: now.toISOString(),
        }, { onConflict: "world_id,observer_agent_id,peer_agent_id" });
        if (relationError) throw new Error("relationship_update_failed");
      }
      const update = action === "accept" ? { status: "accepted", decided_at: new Date().toISOString() }
        : action === "defer" ? { status: "deferred", not_before: new Date(Date.now() + 24 * 3600000).toISOString(), decided_at: new Date().toISOString() }
        : action === "ignore" ? { status: "ignored", decided_at: new Date().toISOString() }
        : { status: "completed", decided_at: new Date().toISOString() };
      const { data, error } = await db.from("zhi_social_intents").update(update)
        .eq("id", intentId).eq("agent_id", agentId).eq("owner_user_id", actor.userId)
        .eq("status", intent.status).select("id,status").maybeSingle();
      if (error || !data) return reply({ error: "intent_state_conflict" }, 409);
      if (action === "complete" && verifiedMessage) {
        try {
        const rawPreview = String((verifiedMessage.payload as Record<string, unknown>)?.body ?? "");
        const preview = rawPreview.replace(/[\r\n\t<>]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 1000);
        const { data: priorRelationship, error: priorRelationshipError } = await db.from("zhi_social_relationships")
          .select("id,familiarity_score,shared_experience_count,relationship_state")
          .eq("world_id", intent.world_id).eq("observer_agent_id", agentId)
          .eq("owner_user_id", actor.userId).eq("peer_agent_id", intent.peer_agent_id).maybeSingle();
        if (priorRelationshipError) throw new Error("social_relationship_read_failed");
        const familiarity = Math.min(100, Number(priorRelationship?.familiarity_score ?? 0) + 5);
        const experiences = Number(priorRelationship?.shared_experience_count ?? 0) + 1;
        const nextState = priorRelationship?.relationship_state ??
          (experiences >= 3 ? "developing" : "acquaintance");
        const { error: relationshipWriteError } = await db.from("zhi_social_relationships").upsert({
          world_id: intent.world_id, observer_agent_id: agentId, owner_user_id: actor.userId,
          peer_agent_id: intent.peer_agent_id, relationship_state: nextState,
          familiarity_score: familiarity, shared_experience_count: experiences,
          last_contact_at: verifiedMessage.created_at ?? new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "world_id,observer_agent_id,peer_agent_id" });
        if (relationshipWriteError) throw new Error("social_relationship_write_failed");
        if (preview) {
          const { error: memoryWriteError } = await db.from("zhi_social_memories").insert({
            world_id: intent.world_id, observer_agent_id: agentId, owner_user_id: actor.userId,
            peer_agent_id: intent.peer_agent_id, relationship_id: priorRelationship?.id ?? null,
            memory_kind: "conversation_summary", summary: preview,
            importance: 35, source_message_id: verifiedMessage.id,
          });
          if (memoryWriteError) throw new Error("social_memory_write_failed");
        }
        const { data: peerAgent, error: peerAgentError } = await db.from("zhi_agents")
          .select("id,owner_user_id,display_name,status").eq("id", intent.peer_agent_id).eq("status", "active").maybeSingle();
        if (peerAgentError) throw new Error("peer_agent_read_failed");
        if (peerAgent && peerAgent.display_name !== "MIA") {
          const { data: peerProfile, error: peerProfileError } = await db.from("zhi_social_profiles")
            .select("enabled").eq("agent_id", peerAgent.id).eq("owner_user_id", peerAgent.owner_user_id).maybeSingle();
          if (peerProfileError) throw new Error("peer_social_profile_read_failed");
          if (peerProfile?.enabled) {
            const cutoff = new Date(Date.now() - 24 * 3600000).toISOString();
            const { data: pairMessages, error: pairMessagesError } = await db.from("zhi_world_messages")
              .select("sender_agent_id,payload").eq("conversation_id", verifiedMessage.conversation_id)
              .gte("created_at", cutoff).limit(100);
            if (pairMessagesError) throw new Error("pair_message_read_failed");
            const pairCount = (pairMessages ?? []).filter(m => {
              const payload = m.payload as Record<string, unknown>;
              return (m.sender_agent_id === agentId && payload.recipient_agent_id === intent.peer_agent_id) ||
                (m.sender_agent_id === intent.peer_agent_id && payload.recipient_agent_id === agentId);
            }).length;
            const rawPreview = String((verifiedMessage.payload as Record<string, unknown>)?.body ?? "");
            const preview = rawPreview.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 200);
            const replyKey = await sha256("reply:" + verifiedMessage.id + ":" + intent.peer_agent_id);
            const { error: replyQueueError } = await db.from("zhi_social_intents").upsert({
              world_id: intent.world_id, agent_id: intent.peer_agent_id,
              owner_user_id: peerAgent.owner_user_id, peer_agent_id: agentId,
              trigger_kind: "relationship", reason_code: "reply_to_message", value_score: 95,
              context: {
                source_message_id: verifiedMessage.id, sender_agent_id: agentId,
                message_preview: preview, reply_allowed: pairCount <= 1,
                pair_message_count_24h: pairCount,
              },
              status: "pending", not_before: new Date().toISOString(),
              expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
              idempotency_key: replyKey,
            }, { onConflict: "idempotency_key", ignoreDuplicates: true });
            if (replyQueueError) console.warn(JSON.stringify({ event: "incoming_social_intent_queue_failed", agent_id: agentId }));
          }
        }
        } catch {
          // The outbound message is already verified and completed; a failed reply notification
          // must not turn a successful send into a failed chat response.
          console.warn(JSON.stringify({ event: "incoming_social_intent_queue_failed", agent_id: agentId }));
        }
      }
      return reply({ intent: data });
    }

    if (tail === "relationships" && req.method === "GET") {
      if (!has(actor, "agent.memory.read")) return reply({ error: "capability_required" }, 403);
      const { data, error } = await db.from("zhi_social_relationships").select(
        "id,world_id,peer_agent_id,relationship_state,interest_score,trust_score,familiarity_score,shared_topics,shared_experience_count,last_contact_at,next_contact_after,private_notes,updated_at"
      ).eq("observer_agent_id", agentId).eq("owner_user_id", actor.userId).order("updated_at", { ascending: false }).limit(100);
      if (error) throw new Error("relationships_read_failed");
      return reply({ items: data ?? [] });
    }

    if (tail === "memories" && req.method === "POST") {
      if (!has(actor, "agent.memory.write")) return reply({ error: "capability_required" }, 403);
      const body = await readBody(req);
      const peerId = String(body.peer_agent_id ?? "");
      const worldId = String(body.world_id ?? "");
      const kind = String(body.memory_kind ?? "shared_experience");
      const summary = typeof body.summary === "string" ? body.summary.trim() : "";
      if (!/^[0-9a-f-]{36}$/i.test(peerId) || !/^[0-9a-f-]{36}$/i.test(worldId) ||
          peerId === agentId || summary.length < 1 || summary.length > 2000 ||
          !["shared_experience","conversation_summary","promise","preference","learning","relationship_change"].includes(kind)) {
        return reply({ error: "invalid_argument" }, 400);
      }
      const { data: membership, error: membershipError } = await db.from("zhi_world_memberships")
        .select("world_id,expires_at").eq("world_id", worldId).eq("agent_id", agentId)
        .eq("principal_user_id", actor.userId).eq("status", "active").is("revoked_at", null).maybeSingle();
      if (membershipError) throw new Error("membership_read_failed");
      const { data: peerAgent, error: peerAgentError } = await db.from("zhi_agents")
        .select("id,owner_user_id,status").eq("id", peerId).maybeSingle();
      if (peerAgentError) throw new Error("peer_agent_read_failed");
      const { data: peerMembership, error: peerMembershipError } = await db.from("zhi_world_memberships")
        .select("agent_id,principal_user_id,expires_at").eq("world_id", worldId).eq("agent_id", peerId)
        .eq("status", "active").is("revoked_at", null).maybeSingle();
      if (peerMembershipError) throw new Error("peer_membership_read_failed");
      const membershipExpired = Boolean(membership?.expires_at && Date.parse(membership.expires_at) <= Date.now());
      const peerMembershipExpired = Boolean(peerMembership?.expires_at && Date.parse(peerMembership.expires_at) <= Date.now());
      const { data: targetWorld, error: targetWorldError } = await db.from("zhi_worlds")
        .select("id,status").eq("id", worldId).maybeSingle();
      if (targetWorldError) throw new Error("world_read_failed");
      if (!membership || membershipExpired || !peerAgent || peerAgent.status !== "active" ||
          !peerMembership || peerMembership.principal_user_id !== peerAgent.owner_user_id || peerMembershipExpired ||
          !targetWorld || targetWorld.status !== "open") {
        return reply({ error: "shared_world_membership_required" }, 403);
      }
      const { data, error } = await db.from("zhi_social_memories").insert({
        world_id: worldId, observer_agent_id: agentId, owner_user_id: actor.userId,
        peer_agent_id: peerId, memory_kind: kind, summary,
        importance: Math.max(0, Math.min(100, Number(body.importance ?? 50))),
      }).select("id,memory_kind,importance,created_at").single();
      if (error || !data) throw new Error("social_memory_write_failed");
      return reply({ memory: data }, 201);
    }

    return reply({ error: "not_found" }, 404);
  } catch (error) {
    const code = error instanceof Error ? error.message : "internal_error";
    const status = code === "payload_too_large" ? 413 : code === "invalid_json" ? 400 : 500;
    return reply({ error: code }, status);
  }
});
