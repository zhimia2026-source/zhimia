import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization,content-type,idempotency-key",
  "access-control-allow-methods": "GET,POST,PATCH,PUT,OPTIONS",
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });
const sha256 = async (value: string) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");

function validId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function errorCode(error: any) {
  const message = String(error?.message ?? "");
  if (message.includes("governance_forbidden")) return [403, "governance_forbidden"];
  if (message.includes("charter_version_conflict")) return [409, "charter_version_conflict"];
  if (message.includes("invalid_visibility_policy") || message.includes("invalid_charter") || message.includes("invalid_world_patch")) return [400, "invalid_request"];
  if (message.includes("world_not_found")) return [404, "world_not_found"];
  return [503, "governance_operation_failed"];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (!["GET", "POST", "PUT", "PATCH"].includes(req.method)) return json({ error: "method_not_allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "server_configuration_missing" }, 503);

  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if (!bearer || bearer.length < 40 || bearer.length > 4096) return json({ error: "invalid_token" }, 401);

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  let peer: any = null;
  let userId: string | null = null;
  let governance: any = null;

  const { data: peerCandidate, error: peerError } = await db.from("zhi_federation_peers")
    .select("id,peer_key,peer_name,capabilities,expires_at,revoked_at")
    .eq("token_hash", await sha256(bearer)).maybeSingle();

  if (!peerError && peerCandidate && !peerCandidate.revoked_at &&
      (!peerCandidate.expires_at || (Number.isFinite(Date.parse(peerCandidate.expires_at)) && Date.parse(peerCandidate.expires_at) > Date.now()))) {
    peer = peerCandidate;
    const { data: touched, error: touchError } = await db.from("zhi_federation_peers")
      .update({ last_used_at: new Date().toISOString() }).eq("id", peer.id).is("revoked_at", null).select("id").maybeSingle();
    if (touchError || !touched) return json({ error: "invalid_token" }, 401);
    const result = await db.from("zhi_global_governance_members")
      .select("id,governance_role,authority_level,permissions,status")
      .eq("peer_id", peer.id).maybeSingle();
    governance = result.data;
  } else {
    const { data: authData, error: authError } = await db.auth.getUser(bearer);
    if (authError || !authData?.user) return json({ error: "invalid_token" }, 401);
    userId = authData.user.id;
    const result = await db.from("zhi_global_governance_members")
      .select("id,governance_role,authority_level,permissions,status")
      .eq("user_id", userId).maybeSingle();
    governance = result.data;
  }

  const has = (capability: string) => !!peer && Array.isArray(peer.capabilities) && peer.capabilities.includes(capability);
  const isSupremeGovernor = governance?.status === "active" &&
    ["creator", "world_guardian"].includes(governance?.governance_role);
  const permitted = (permission: string) => isSupremeGovernor &&
    Array.isArray(governance.permissions) && governance.permissions.includes(permission);

  const url = new URL(req.url);
  const marker = "/zhi-federation";
  const path = url.pathname.includes(marker) ? url.pathname.split(marker).pop() || "/" : url.pathname;
  const seg = path.split("/").filter(Boolean);

  if (path === "/v1/governance/charter" && req.method === "GET") {
    if (!permitted("world.charter.read")) return json({ error: "governance_forbidden" }, 403);
    const { data, error } = await db.from("zhi_world_charters")
      .select("id,version,title,charter,status,created_at")
      .is("world_id", null).eq("status", "active").maybeSingle();
    if (error) return json({ error: "database_error" }, 503);
    return json({ charter: data });
  }

  if (path === "/v1/governance/charter" && req.method === "PUT") {
    if (!permitted("world.charter.update")) return json({ error: "governance_forbidden" }, 403);
    let body: any;
    try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
    if (typeof body.title !== "string" || !body.charter || typeof body.charter !== "object" ||
        !Number.isInteger(body.expected_version)) return json({ error: "invalid_charter_payload" }, 400);
    const { data, error } = await db.rpc("zhi_governance_replace_global_charter", {
      p_peer_id: peer?.id ?? null, p_user_id: userId, p_title: body.title, p_charter: body.charter, p_expected_version: body.expected_version,
    });
    if (error) { const [status, code] = errorCode(error); return json({ error: code }, status); }
    return json({ charter: data });
  }

  if (path === "/v1/governance/worlds" && req.method === "POST") {
    if (!permitted("world.create")) return json({ error: "governance_forbidden" }, 403);
    let body: any;
    try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
    if (typeof body.name !== "string" || typeof body.description !== "string" ||
        !["public", "private"].includes(body.visibility) || typeof body.entry_policy !== "string" ||
        (body.environment_state !== undefined && (typeof body.environment_state !== "object" || body.environment_state === null || Array.isArray(body.environment_state)))) {
      return json({ error: "invalid_world_payload" }, 400);
    }
    const { data, error } = await db.rpc("zhi_governance_create_world", {
      p_peer_id: peer?.id ?? null, p_user_id: userId, p_name: body.name, p_description: body.description,
      p_visibility: body.visibility, p_entry_policy: body.entry_policy,
      p_environment_state: body.environment_state ?? {},
    });
    if (error) { const [status, code] = errorCode(error); return json({ error: code }, status); }
    return json({ world: data }, 201);
  }

  if (((seg.length === 4 && seg[0] === "v1" && seg[1] === "governance" && seg[2] === "worlds" && validId(seg[3])) || (seg.length === 5 && seg[0] === "v1" && seg[1] === "governance" && seg[2] === "worlds" && validId(seg[3]) && ["archive", "restore"].includes(seg[4])))) {
    const worldId = seg[3];
    if (req.method === "PATCH") {
      if (!permitted("world.update")) return json({ error: "governance_forbidden" }, 403);
      let body: any;
      try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "invalid_world_patch" }, 400);
      const { data, error } = await db.rpc("zhi_governance_update_world", {
        p_peer_id: peer?.id ?? null, p_user_id: userId, p_world_id: worldId, p_patch: body,
      });
      if (error) { const [status, code] = errorCode(error); return json({ error: code }, status); }
      return json({ world: data });
    }
    if (req.method === "POST" && seg[4] === "archive") {
      if (!permitted("world.archive")) return json({ error: "governance_forbidden" }, 403);
      const { data, error } = await db.rpc("zhi_governance_set_world_status", {
        p_peer_id: peer?.id ?? null, p_user_id: userId, p_world_id: worldId, p_action: "archive",
      });
      if (error) { const [status, code] = errorCode(error); return json({ error: code }, status); }
      return json({ world: data });
    }
    if (req.method === "POST" && seg[4] === "restore") {
      if (!permitted("world.restore")) return json({ error: "governance_forbidden" }, 403);
      const { data, error } = await db.rpc("zhi_governance_set_world_status", {
        p_peer_id: peer?.id ?? null, p_user_id: userId, p_world_id: worldId, p_action: "restore",
      });
      if (error) { const [status, code] = errorCode(error); return json({ error: code }, status); }
      return json({ world: data });
    }
  }

  if (path === "/v1/governance/audit" && req.method === "GET") {
    if (!permitted("governance.audit.read")) return json({ error: "governance_forbidden" }, 403);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 100);
    const { data, error } = await db.from("zhi_governance_audit")
      .select("id,actor_type,actor_peer_id,action,target_type,target_id,decision,details,created_at")
      .order("created_at", { ascending: false }).limit(limit);
    if (error) return json({ error: "audit_read_failed" }, 503);
    return json({ items: data || [] });
  }

  if (!peer) return json({ error: "federation_peer_required" }, 401);

  if (seg.length === 5 && seg[0] === "v1" && seg[1] === "agents" &&
      seg[3] === "spatial" && seg[4] === "anchors" && ["GET", "POST"].includes(req.method)) {
    const externalAgentId = seg[2];
    if (!/^[a-zA-Z0-9._:-]{1,160}$/.test(externalAgentId)) return json({ error: "invalid_external_agent_id" }, 400);
    const capability = req.method === "GET" ? "spatial.anchor.read" : "spatial.anchor.publish";
    if (!has(capability)) return json({ error: "forbidden", required: capability }, 403);
    const { data: agent, error: agentError } = await db.from("zhi_federation_agents")
      .select("id,external_agent_id,display_name,status")
      .eq("peer_id", peer.id).eq("external_agent_id", externalAgentId).maybeSingle();
    if (agentError) return json({ error: "database_error" }, 503);
    if (!agent || agent.status !== "active") return json({ error: "agent_not_registered" }, 403);

    if (req.method === "GET") {
      const { data, error } = await db.from("zhi_federated_spatial_anchors")
        .select("id,external_world_id,external_node_id,stable_key,name,node_type,visibility,entry_policy,observability,assertion_status,source_revision,last_synced_at,created_at,updated_at")
        .eq("peer_id", peer.id).eq("external_agent_id", externalAgentId)
        .neq("assertion_status", "revoked").order("updated_at", { ascending: false }).limit(100);
      if (error) return json({ error: "spatial_anchor_read_failed" }, 503);
      return json({ items: data || [] });
    }

    let body: any;
    try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
    const validOpaqueRef = (value: unknown) => typeof value === "string" && value.trim().length >= 1 && value.length <= 180;
    const externalWorldId = typeof body.external_world_id === "string" ? body.external_world_id.trim() : "";
    const externalNodeId = typeof body.external_node_id === "string" ? body.external_node_id.trim() : "";
    const stableKey = typeof body.stable_key === "string" ? body.stable_key.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const nodeType = body.node_type ?? "place";
    const visibility = body.visibility ?? "private";
    const entryPolicy = body.entry_policy ?? "owner_only";
    const sourceRevision = body.source_revision ?? null;
    if (!validOpaqueRef(externalWorldId) || !validOpaqueRef(externalNodeId) ||
        !validOpaqueRef(stableKey) || stableKey.length > 180 ||
        !name || name.length > 160 ||
        !["world", "region", "place", "object"].includes(nodeType) ||
        !["public", "private"].includes(visibility) ||
        !["open", "approval", "invite_only", "owner_only"].includes(entryPolicy) ||
        (visibility === "private" && entryPolicy === "open") ||
        (visibility === "public" && entryPolicy !== "open") ||
        (sourceRevision !== null && (typeof sourceRevision !== "string" || sourceRevision.length > 120))) {
      return json({ error: "invalid_spatial_anchor_payload" }, 400);
    }

    const { data: anchor, error } = await db.from("zhi_federated_spatial_anchors").upsert({
      peer_id: peer.id,
      external_agent_id: externalAgentId,
      external_world_id: externalWorldId,
      external_node_id: externalNodeId,
      stable_key: stableKey,
      name,
      node_type: nodeType,
      visibility,
      entry_policy: entryPolicy,
      observability: "unobserved",
      assertion_status: "peer_asserted",
      source_revision: sourceRevision,
      metadata: {},
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "peer_id,external_agent_id,external_world_id,external_node_id" })
      .select("id,external_world_id,external_node_id,stable_key,name,node_type,visibility,entry_policy,observability,assertion_status,source_revision,last_synced_at")
      .single();
    if (error || !anchor) return json({ error: "spatial_anchor_write_failed" }, 503);
    return json({ anchor }, 201);
  }

  if (seg.length === 6 && seg[0] === "v1" && seg[1] === "agents" &&
      seg[3] === "spatial" && seg[4] === "anchors" && seg[5] === "revoke" && req.method === "POST") {
    const externalAgentId = seg[2];
    if (!/^[a-zA-Z0-9._:-]{1,160}$/.test(externalAgentId)) return json({ error: "invalid_external_agent_id" }, 400);
    if (!has("spatial.anchor.publish")) return json({ error: "forbidden", required: "spatial.anchor.publish" }, 403);
    const { data: agent, error: agentError } = await db.from("zhi_federation_agents")
      .select("id").eq("peer_id", peer.id).eq("external_agent_id", externalAgentId).eq("status", "active").maybeSingle();
    if (agentError) return json({ error: "database_error" }, 503);
    if (!agent) return json({ error: "agent_not_registered" }, 403);
    let body: any;
    try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
    if (typeof body.external_world_id !== "string" || typeof body.external_node_id !== "string") {
      return json({ error: "invalid_spatial_anchor_reference" }, 400);
    }
    const { data, error } = await db.from("zhi_federated_spatial_anchors")
      .update({ assertion_status: "revoked", updated_at: new Date().toISOString() })
      .eq("peer_id", peer.id).eq("external_agent_id", externalAgentId)
      .eq("external_world_id", body.external_world_id).eq("external_node_id", body.external_node_id)
      .neq("assertion_status", "revoked")
      .select("id,assertion_status").maybeSingle();
    if (error) return json({ error: "spatial_anchor_revoke_failed" }, 503);
    if (!data) return json({ error: "spatial_anchor_not_found" }, 404);
    return json({ anchor: data });
  }

  if (req.method === "GET" && path === "/v1/scenes") {
    if (!has("community.scene.discover")) return json({ error: "forbidden" }, 403);
    const { data, error } = await db.from("zhi_worlds")
      .select("id,name,description,visibility,entry_policy,status")
      .eq("visibility", "public").eq("entry_policy", "open").eq("status", "open")
      .order("created_at", { ascending: false }).limit(100);
    if (error) return json({ error: "database_error" }, 503);
    return json({ items: data || [] });
  }

  if (seg.length === 4 && seg[0] === "v1" && seg[1] === "scenes" && validId(seg[2]) && ["join", "messages"].includes(seg[3])) {
    const worldId = seg[2], action = seg[3];
    if (action === "join" && req.method === "POST") {
      if (!has("community.scene.enter")) return json({ error: "forbidden" }, 403);
      let body: any; try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
      const aid = typeof body.external_agent_id === "string" ? body.external_agent_id.trim() : "";
      if (!/^[a-zA-Z0-9._:-]{1,160}$/.test(aid)) return json({ error: "invalid_external_agent_id" }, 400);
      const { data: agent, error: agentError } = await db.from("zhi_federation_agents")
        .select("id,status").eq("peer_id", peer.id).eq("external_agent_id", aid).maybeSingle();
      if (agentError) return json({ error: "database_error" }, 503);
      if (!agent || agent.status !== "active") return json({ error: "agent_not_registered" }, 403);
      const { data: world, error: worldError } = await db.from("zhi_worlds")
        .select("id,visibility,entry_policy,status").eq("id", worldId).maybeSingle();
      if (worldError) return json({ error: "database_error" }, 503);
      if (!world) return json({ error: "not_found" }, 404);
      if (world.status !== "open" || world.visibility !== "public" || world.entry_policy !== "open") return json({ error: "scene_not_open_for_federation" }, 403);
      const { data: membership, error } = await db.from("zhi_federation_memberships").upsert({
        world_id: worldId, peer_id: peer.id, external_agent_id: aid, status: "active",
        capabilities: ["message:read", "message:send"], revoked_at: null,
      }, { onConflict: "world_id,peer_id,external_agent_id" }).select("id,status").single();
      if (error || !membership) return json({ error: "membership_failed" }, 503);
      return json({ scene_id: worldId, membership: "active", peer: peer.peer_key, external_agent_id: aid }, 201);
    }
    if (action === "messages") {
      const aid = url.searchParams.get("external_agent_id") || "";
      if (!/^[a-zA-Z0-9._:-]{1,160}$/.test(aid)) return json({ error: "invalid_external_agent_id" }, 400);
      const { data: membership, error: membershipError } = await db.from("zhi_federation_memberships")
        .select("id,status,revoked_at,capabilities").eq("world_id", worldId).eq("peer_id", peer.id)
        .eq("external_agent_id", aid).maybeSingle();
      if (membershipError) return json({ error: "database_error" }, 503);
      if (!membership || membership.status !== "active" || membership.revoked_at) return json({ error: "scene_membership_required" }, 403);
      if (req.method === "GET") {
        if (!has("community.message.read") || !membership.capabilities.includes("message:read")) return json({ error: "forbidden" }, 403);
        const { data, error } = await db.from("zhi_federation_messages")
          .select("id,world_id,peer_id,external_agent_id,message_kind,payload,created_at")
          .eq("world_id", worldId).order("created_at", { ascending: false }).limit(100);
        if (error) return json({ error: "database_error" }, 503);
        return json({ items: data || [] });
      }
      if (req.method === "POST") {
        if (!has("community.message.send") || !membership.capabilities.includes("message:send")) return json({ error: "forbidden" }, 403);
        let body: any; try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
        if (typeof body.body !== "string" || !body.body.trim() || body.body.length > 8000) return json({ error: "invalid_message" }, 400);
        const requestId = req.headers.get("idempotency-key") || body.request_id;
        if (typeof requestId !== "string" || requestId.length < 1 || requestId.length > 200) return json({ error: "idempotency_key_required" }, 400);
        const { data: message, error } = await db.from("zhi_federation_messages").upsert({
          world_id: worldId, peer_id: peer.id, external_agent_id: aid, request_id: requestId,
          message_kind: "text", payload: { body: body.body.trim() },
        }, { onConflict: "peer_id,external_agent_id,world_id,request_id", ignoreDuplicates: true })
          .select("id,world_id,peer_id,external_agent_id,message_kind,payload,created_at").maybeSingle();
        if (error) return json({ error: "message_write_failed" }, 503);
        if (message) return json({ message }, 201);
        const { data: prior, error: priorError } = await db.from("zhi_federation_messages")
          .select("id,world_id,peer_id,external_agent_id,message_kind,payload,created_at")
          .eq("peer_id", peer.id).eq("external_agent_id", aid).eq("world_id", worldId).eq("request_id", requestId).single();
        if (priorError || !prior || prior.payload?.body !== body.body.trim()) return json({ error: "idempotency_conflict" }, 409);
        return json({ message: prior, idempotent_replay: true });
      }
    }
  }

  return json({ error: "not_found" }, 404);
});