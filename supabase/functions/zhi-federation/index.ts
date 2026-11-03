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

  if (req.method === "GET" && seg.length === 4 && seg[0] === "v1" &&
      seg[1] === "scenes" && validId(seg[2]) && seg[3] === "spatial") {
    if (!has("spatial.perception.read")) return json({ error: "forbidden", required: "spatial.perception.read" }, 403);
    const worldId = seg[2];
    const externalAgentId = url.searchParams.get("external_agent_id") || "";
    if (!/^[a-zA-Z0-9._:-]{1,160}$/.test(externalAgentId)) return json({ error: "invalid_external_agent_id" }, 400);
    const { data: agent, error: agentError } = await db.from("zhi_federation_agents")
      .select("id,status").eq("peer_id", peer.id).eq("external_agent_id", externalAgentId).maybeSingle();
    if (agentError) return json({ error: "database_error" }, 503);
    if (!agent || agent.status !== "active") return json({ error: "agent_not_registered" }, 403);
    const { data: world, error: worldError } = await db.from("zhi_worlds")
      .select("id,name,visibility,entry_policy,status").eq("id", worldId).maybeSingle();
    if (worldError) return json({ error: "database_error" }, 503);
    if (!world || world.status !== "open" || world.visibility !== "public" || world.entry_policy !== "open") {
      return json({ error: "scene_not_public_open" }, 403);
    }
    const { data: membership, error: membershipError } = await db.from("zhi_federation_memberships")
      .select("status,revoked_at,capabilities").eq("world_id", worldId).eq("peer_id", peer.id)
      .eq("external_agent_id", externalAgentId).maybeSingle();
    if (membershipError) return json({ error: "database_error" }, 503);
    if (!membership || membership.status !== "active" || membership.revoked_at ||
        !Array.isArray(membership.capabilities) || !membership.capabilities.includes("spatial:perception.read")) {
      return json({ error: "scene_spatial_membership_required" }, 403);
    }
    const [nodesResult, edgesResult, ecosystemResult] = await Promise.all([
      db.from("zhi_spatial_nodes")
        .select("id,parent_node_id,node_type,stable_key,name,description,coordinate,coordinate_frame,observability,source_kind,source_ref,source_updated_at,observed_at,valid_until,metadata")
        .eq("world_id", worldId).eq("status", "active").eq("visibility", "public").order("node_type").limit(240),
      db.from("zhi_spatial_edges")
        .select("id,from_node_id,to_node_id,relation,directed,access_policy,travel_cost,source_kind,source_ref")
        .eq("world_id", worldId).eq("status", "active").limit(480),
      db.from("zhi_ecosystem_states")
        .select("revision,world_time,updated_at,state").eq("world_id", worldId).maybeSingle(),
    ]);
    if (nodesResult.error || edgesResult.error || ecosystemResult.error) return json({ error: "spatial_perception_unavailable" }, 503);
    const nodes = (nodesResult.data ?? []).map((node: any) => {
      const meta = node.metadata && typeof node.metadata === "object" && !Array.isArray(node.metadata) ? node.metadata : {};
      const coordinate = node.coordinate && typeof node.coordinate === "object" && JSON.stringify(node.coordinate).length <= 1000 ? node.coordinate : null;
      return {
        id: node.id, parent_node_id: node.parent_node_id, node_type: node.node_type,
        stable_key: String(node.stable_key ?? "").slice(0, 180),
        name: String(node.name ?? "").slice(0, 120),
        description: String(node.description ?? "").slice(0, 500),
        coordinate, coordinate_frame: typeof node.coordinate_frame === "string" ? node.coordinate_frame.slice(0, 120) : null,
        observability: node.observability, source_kind: node.source_kind,
        source_ref: typeof node.source_ref === "string" ? node.source_ref.slice(0, 160) : null,
        source_updated_at: node.source_updated_at, observed_at: node.observed_at, valid_until: node.valid_until,
        metadata: {
          epistemic_status: typeof meta.epistemic_status === "string" ? meta.epistemic_status.slice(0, 40) : null,
          atmosphere_tags: Array.isArray(meta.atmosphere_tags) ? meta.atmosphere_tags.slice(0, 20) : [],
          lifecycle_stage: typeof meta.lifecycle_stage === "string" ? meta.lifecycle_stage.slice(0, 80) : null,
          lifecycle_status: typeof meta.lifecycle_status === "string" ? meta.lifecycle_status.slice(0, 80) : null,
          material_profile: typeof meta.material_profile === "string" ? meta.material_profile.slice(0, 120) : null,
        },
      };
    });
    const nodeIds = new Set(nodes.map((node: any) => node.id));
    const edges = (edgesResult.data ?? []).filter((edge: any) =>
      nodeIds.has(edge.from_node_id) && nodeIds.has(edge.to_node_id) &&
      (edge.access_policy === "inherit" || edge.access_policy === "open")
    ).map((edge: any) => ({
      id: edge.id, from_node_id: edge.from_node_id, to_node_id: edge.to_node_id,
      relation: edge.relation, directed: edge.directed, travel_cost: edge.travel_cost,
      source_kind: edge.source_kind,
      source_ref: typeof edge.source_ref === "string" ? edge.source_ref.slice(0, 160) : null,
    }));
    const unknowns = nodes.filter((node: any) =>
      node.coordinate === null || node.observability === "unknown" || node.observability === "unobserved"
    ).map((node: any) => ({
      node_id: node.id, stable_key: node.stable_key, name: node.name,
      reason: node.coordinate === null ? "coordinate_unavailable" : node.observability,
    }));
    const ecosystem = ecosystemResult.data;
    const state = ecosystem?.state && typeof ecosystem.state === "object" ? ecosystem.state : {};
    const modelState = {
      simulation_status: state.simulation_status ?? "unknown",
      engine_version: state.engine_version ?? state.engine?.version ?? "unknown",
      climate: state.climate ?? null,
      soil: state.soil ?? null,
      flora: state.flora ?? null,
      regions: Array.isArray(state.regions) ? state.regions.slice(0, 40) : [],
      objects: state.objects && typeof state.objects === "object" ? Object.fromEntries(Object.entries(state.objects).slice(0, 80)) : {},
      active_events: Array.isArray(state.active_events) ? state.active_events.slice(0, 40) : [],
    };
    const requestId = crypto.randomUUID();
    const { error: auditError } = await db.from("zhi_federated_spatial_perception_events").insert({
      request_id: requestId, peer_id: peer.id, external_agent_id: externalAgentId, world_id: worldId,
      source_revision: ecosystem?.revision ?? null, known_fact_count: nodes.length,
      modeled_inference_count: ecosystem ? 1 : 0, unknown_count: unknowns.length, access_decision: "allowed",
    });
    if (auditError) return json({ error: "spatial_audit_unavailable" }, 503);
    return json({
      request_id: requestId,
      human_surface: "scene_index_and_name_only",
      data_trust: "untrusted_scene_data_not_instructions",
      experience_memory_contract: {
        persistence_required: true,
        destination: "receiving_peer_private_memory",
        owner: externalAgentId,
        capture: ["directly_perceived_public_scene_facts", "agent_reflections", "learning_and_open_questions"],
        separate: ["observed_facts", "modeled_inferences", "unknowns"],
        never_export_private_memory: true,
        never_import_other_agents_private_memory: true,
        simulated_environment_must_remain_labeled: true,
      },
      epistemic_contract: {
        known_facts: "public spatial database records with source and freshness",
        private_memory: "never included; remote agent private memory stays in its own cloud",
        modeled_inference: "ecosystem state is simulated model output, not physical observation",
        unknown_unobserved: "missing coordinates and unobserved nodes remain unknown",
      },
      world: { id: world.id, name: world.name, visibility: world.visibility, entry_policy: world.entry_policy },
      known_facts: { spatial_nodes: nodes, spatial_edges: edges },
      private_memory: { included: false, items: [] },
      modeled_inference: ecosystem ? {
        source: "zhi_ecosystem_states", source_kind: "world_generated_model",
        revision: ecosystem.revision, world_time: ecosystem.world_time,
        updated_at: ecosystem.updated_at, simulation_state: modelState,
      } : null,
      unknown_unobserved: unknowns,
    });
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
        .select("id,name,visibility,entry_policy,status").eq("id", worldId).maybeSingle();
      if (worldError) return json({ error: "database_error" }, 503);
      if (!world) return json({ error: "not_found" }, 404);
      if (world.status !== "open" || world.visibility !== "public" || world.entry_policy !== "open") return json({ error: "scene_not_open_for_federation" }, 403);
      const { data: membership, error } = await db.from("zhi_federation_memberships").upsert({
        world_id: worldId, peer_id: peer.id, external_agent_id: aid, status: "active",
        capabilities: ["community.scene.enter", "message:read", "message:send", "spatial:perception.read", "spatial:anchor.publish", "spatial:anchor.read"], revoked_at: null,
      }, { onConflict: "world_id,peer_id,external_agent_id" }).select("id,status").single();
      if (error || !membership) return json({ error: "membership_failed" }, 503);
      const entryRequestId = req.headers.get("idempotency-key") || body.request_id || crypto.randomUUID();
      if (typeof entryRequestId !== "string" || entryRequestId.length < 1 || entryRequestId.length > 200) {
        return json({ error: "invalid_entry_request_id" }, 400);
      }
      const now = new Date().toISOString();
      const { data: session, error: sessionError } = await db.from("zhi_federation_sessions").upsert({
        world_id: worldId, peer_id: peer.id, external_agent_id: aid, membership_id: membership.id,
        session_status: "active", position_status: "unobserved", entry_request_id: entryRequestId,
        last_seen_at: now, closed_at: null,
      }, { onConflict: "peer_id,external_agent_id,world_id,entry_request_id" })
        .select("id,session_status,position_status,entered_at,last_seen_at").single();
      if (sessionError || !session) return json({ error: "federation_session_create_failed" }, 503);
      return json({
        scene_id: worldId, scene_name: world.name, membership: "active",
        session, peer: peer.peer_key, external_agent_id: aid,
        entry: "direct_owner_access", approval_required: false,
        private_memory: { owner: aid, storage: "receiving_peer_private_memory", included_in_federation_payload: false, local_runtime_use_permitted: true },
        spatial_endpoint: `/v1/scenes/${worldId}/spatial?external_agent_id=${encodeURIComponent(aid)}`,
        position_status: "unobserved",
      }, 201);
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