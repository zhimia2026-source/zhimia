import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildUnifiedEnvironmentEvents } from "./perception_events.ts";

const URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WORLD_ID = "50b06c01-060d-49fa-8988-8f38c13406d7";
const MIA_PEER_ID = "dedf7805-df3d-4437-bb1f-3c4c7a32aa7f";
const EXTERNAL_AGENT_ID = "mia";
const headers = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization,content-type",
  "access-control-allow-methods": "POST,OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });
const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply({ ok: false, error: "method_not_allowed" }, 405);
  if (!URL || !SERVICE_KEY) return reply({ ok: false, error: "server_configuration_missing" }, 503);

  const token = req.headers.get("authorization")?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if (!token || token.length < 40 || token.length > 4096) return reply({ ok: false, error: "invalid_token" }, 401);

  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > 8192) return reply({ ok: false, error: "payload_too_large" }, 413);
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid_body");
  } catch { return reply({ ok: false, error: "invalid_json" }, 400); }

  const action = String(body.action ?? "perceive");
  if (!["perceive", "status"].includes(action)) {
    return reply({ ok: false, error: "action_not_supported_by_read_only_world_bridge", supported_actions: ["perceive", "status"] }, 400);
  }

  const db = createClient(URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: peer, error: peerError } = await db.from("zhi_federation_peers")
    .select("id,peer_name,expires_at,revoked_at,capabilities")
    .eq("token_hash", await sha256(token)).maybeSingle();
  if (peerError || !peer || peer.id !== MIA_PEER_ID || peer.revoked_at ||
      (peer.expires_at && Date.parse(peer.expires_at) <= Date.now())) {
    return reply({ ok: false, error: "invalid_or_unapproved_world_manager" }, 401);
  }

  const { data: governance, error: governanceError } = await db.from("zhi_global_governance_members")
    .select("governance_role,authority_level,permissions,status")
    .eq("peer_id", peer.id).eq("status", "active").maybeSingle();
  if (governanceError || !governance || governance.governance_role !== "world_guardian" ||
      !Array.isArray(governance.permissions) ||
      !governance.permissions.includes("spatial.perception.read") ||
      !governance.permissions.includes("scene.read")) {
    return reply({ ok: false, error: "world_guardian_perception_permission_required" }, 403);
  }

  const { data: membership, error: membershipError } = await db.from("zhi_federation_memberships")
    .select("id,status,revoked_at")
    .eq("world_id", WORLD_ID).eq("peer_id", peer.id)
    .eq("external_agent_id", EXTERNAL_AGENT_ID).eq("status", "active")
    .is("revoked_at", null).maybeSingle();
  if (membershipError || !membership) return reply({ ok: false, error: "active_world_membership_required" }, 403);

  const { data: world, error: worldError } = await db.from("zhi_worlds")
    .select("id,name,status,visibility,entry_policy,environment_state,updated_at")
    .eq("id", WORLD_ID).maybeSingle();
  if (worldError || !world || world.status !== "open") return reply({ ok: false, error: "world_unavailable" }, 409);

  if (action === "status") {
    const { data: runtime, error } = await db.from("zhi_forest_runtime_state")
      .select("scene_id,current_node_id,current_position,coordinate_frame,sequence,session_status,position_status,updated_at")
      .eq("world_id", WORLD_ID).eq("peer_id", peer.id)
      .eq("external_agent_id", EXTERNAL_AGENT_ID).order("updated_at", { ascending: false }).limit(10);
    if (error) return reply({ ok: false, error: "runtime_status_unavailable" }, 503);
    return reply({ ok: true, action, world: { id: world.id, name: world.name, status: world.status },
      world_manager: { external_agent_id: EXTERNAL_AGENT_ID, role: governance.governance_role, authority_level: governance.authority_level },
      runtime_sessions: runtime ?? [], private_memory_included: false });
  }

  const [nodesResult, edgesResult, ecosystemResult, ecosystemEventsResult, spatialEventsResult,
    federationSessionResult, forestStateResult, forestEventsResult, federatedPresenceResult, federatedMovementEventsResult] = await Promise.all([
    db.from("zhi_spatial_nodes")
      .select("id,parent_node_id,node_type,stable_key,name,description,coordinate,coordinate_frame,visibility,entry_policy,observability,source_kind,source_ref,source_updated_at,observed_at,valid_until,metadata,status")
      .eq("world_id", WORLD_ID).eq("status", "active").order("node_type").limit(500),
    db.from("zhi_spatial_edges")
      .select("id,from_node_id,to_node_id,relation,directed,access_policy,travel_cost,source_kind,source_ref,status")
      .eq("world_id", WORLD_ID).eq("status", "active").limit(1000),
    db.from("zhi_ecosystem_states")
      .select("revision,world_time,updated_at,state").eq("world_id", WORLD_ID).maybeSingle(),
    db.from("zhi_ecosystem_events")
      .select("id,state_revision,event_kind,source_kind,occurred_at,payload,causal_chain")
      .eq("world_id", WORLD_ID).order("occurred_at", { ascending: false }).limit(25),
    db.from("zhi_spatial_environment_events")
      .select("id,event_type,from_node_id,to_node_id,evidence_id,environment_revision,perception_delta,occurred_at,metadata")
      .eq("world_id", WORLD_ID).is("agent_id", null).order("occurred_at", { ascending: false }).limit(25),
    db.from("zhi_federation_sessions")
      .select("id,session_status,position_status,entered_at,last_seen_at,closed_at")
      .eq("world_id", WORLD_ID).eq("peer_id", peer.id).eq("external_agent_id", EXTERNAL_AGENT_ID)
      .order("last_seen_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("zhi_forest_runtime_state")
      .select("scene_id,current_node_id,current_position,coordinate_frame,runtime_instance_id,sequence,session_status,position_status,environment_state,updated_at")
      .eq("world_id", WORLD_ID).eq("peer_id", peer.id).eq("external_agent_id", EXTERNAL_AGENT_ID)
      .order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("zhi_forest_runtime_events")
      .select("sequence,event_type,position,payload,occurred_at")
      .eq("world_id", WORLD_ID).eq("peer_id", peer.id).eq("external_agent_id", EXTERNAL_AGENT_ID)
      .order("sequence", { ascending: false }).limit(12),
    db.from("zhi_federated_spatial_presence")
      .select("current_node_id,position_status,provenance,revision,updated_at")
      .eq("world_id", WORLD_ID).eq("peer_id", peer.id).eq("external_agent_id", EXTERNAL_AGENT_ID).maybeSingle(),
    db.from("zhi_federated_spatial_events")
      .select("id,event_type,from_node_id,to_node_id,occurred_at,perception_delta,metadata")
      .eq("world_id", WORLD_ID).eq("peer_id", peer.id).eq("external_agent_id", EXTERNAL_AGENT_ID)
      .order("occurred_at", { ascending: false }).limit(25),
  ]);
  if (nodesResult.error || edgesResult.error || ecosystemResult.error || ecosystemEventsResult.error ||
      spatialEventsResult.error || federationSessionResult.error || forestStateResult.error || forestEventsResult.error ||
      federatedPresenceResult.error || federatedMovementEventsResult.error) {
    return reply({ ok: false, error: "world_perception_read_failed" }, 503);
  }

  const nodes = nodesResult.data ?? [];
  const edges = edgesResult.data ?? [];
  const ecosystem = ecosystemResult.data;
  const federationSession = federationSessionResult.data;
  const forestRuntime = forestStateResult.data;
  const federatedPresence = federatedPresenceResult.data;
  const environmentEvents = buildUnifiedEnvironmentEvents(
    ecosystemEventsResult.data ?? [],
    spatialEventsResult.data ?? [],
    forestEventsResult.data ?? [],
    federatedMovementEventsResult.data ?? [],
  );
  const environmentFeedback = {
    source: "zhi-aurora-world-runtime.v1",
    event_stream_contract: {
      includes: ["zhi_ecosystem_events", "zhi_spatial_environment_events", "zhi_forest_runtime_events", "zhi_federated_spatial_events"],
      ordering: "occurred_at_ascending",
      ecosystem_scope: "shared_world_events",
      spatial_scope: "public_world_events_only",
      runtime_scope: "authenticated_mia_peer_scene_only",
      federated_spatial_scope: "requesting_peer_and_external_agent_only",
      causal_chain: "preserved_when_recorded; empty_when_not_recorded",
      epistemic_rule: "modeled world and runtime events are not physical sensor observations",
    },
    event_count: environmentEvents.length,
    events: environmentEvents,
  };
  const walkableEdges = edges.filter((e: any) => ["walk", "walkable", "path", "connects", "traversable"].includes(String(e.relation).toLowerCase()));
  const locatedNodes = nodes.filter((n: any) => n.coordinate && n.coordinate_frame);
  const unknowns = nodes.filter((n: any) =>
    !n.coordinate || !n.coordinate_frame || ["unknown", "unobserved"].includes(n.observability)
  ).map((n: any) => ({
    node_id: n.id, stable_key: n.stable_key, name: n.name,
    missing: [!n.coordinate ? "coordinate" : null, !n.coordinate_frame ? "coordinate_frame" : null,
      ["unknown", "unobserved"].includes(n.observability) ? "observation" : null].filter(Boolean),
  }));

  return reply({
    ok: true, action,
    captured_at: new Date().toISOString(),
    world: { id: world.id, name: world.name, status: world.status, visibility: world.visibility,
      entry_policy: world.entry_policy, updated_at: world.updated_at },
    world_manager: { external_agent_id: EXTERNAL_AGENT_ID, role: governance.governance_role,
      authority_level: governance.authority_level, permissions: governance.permissions },
    runtime_presence: {
      federation_session: federationSession ?? null,
      federated_spatial_presence: federatedPresence ? {
        current_node_id: federatedPresence.current_node_id,
        position_status: federatedPresence.position_status,
        provenance: federatedPresence.provenance,
        revision: federatedPresence.revision,
        updated_at: federatedPresence.updated_at,
      } : null,
      scene_runtime: forestRuntime ? {
        scene_id: forestRuntime.scene_id,
        current_node_id: forestRuntime.current_node_id,
        current_position: forestRuntime.current_position,
        coordinate_frame: forestRuntime.coordinate_frame,
        runtime_instance_id: forestRuntime.runtime_instance_id,
        sequence: forestRuntime.sequence,
        session_status: forestRuntime.session_status,
        position_status: forestRuntime.position_status,
        environment_state: forestRuntime.environment_state,
        updated_at: forestRuntime.updated_at,
        recent_events: forestEventsResult.data ?? [],
      } : null,
      semantics: "Persisted headless scene-runtime state and event records; not physical sensor telemetry.",
    },
    perception: {
      scene_sensory_frame: (() => {
        const state: any = ecosystem?.state ?? {};
        const climate: any = state.climate ?? {};
        const weather: any = climate.weather ?? {};
        const objects: any = state.objects ?? {};
        const forest = nodes.find((n: any) => n.stable_key === "crystal_forest");
        const mistGate = nodes.find((n: any) => n.stable_key === "forest_mist_gate");
        const crystalTree = nodes.find((n: any) => n.stable_key === "crystal_forest_tree");
        const ocean = nodes.find((n: any) => n.stable_key === "ocean_of_light");
        const tideLamp = nodes.find((n: any) => n.stable_key === "ocean_tide_lantern");
        const local = forestRuntime?.environment_state ?? {};
        const latestEcoEvent: any = ecosystemEventsResult.data?.[0] ?? null;
        const eventPayload: any = latestEcoEvent?.payload ?? {};
        return {
          frame_id: "aurora-semantic-scene-frame-v1",
          generated_at: new Date().toISOString(),
          scene_context: {
            current_scene: forestRuntime?.scene_id ?? null,
            current_position: forestRuntime?.current_position ?? null,
            coordinate_frame: forestRuntime?.coordinate_frame ?? null,
            current_node_id: forestRuntime?.current_node_id ?? null,
            note: "Scene descriptions are database-backed semantic representations; this does not mean Mia receives rendered pixels."
          },
          visual_semantics: {
            source_kind: "database_scene_description_plus_world_model",
            region: forest ? { name: forest.name, description: forest.description, atmosphere_tags: forest.metadata?.atmosphere_tags ?? [] } : null,
            mist: mistGate ? { name: mistGate.name, description: mistGate.description, modeled_object_state: objects.forest_mist_gate?.state ?? null } : null,
            crystal: crystalTree ? { name: crystalTree.name, description: crystalTree.description, modeled_object_state: objects.crystal_forest_tree?.state ?? null } : null,
            ocean: ocean ? { name: ocean.name, description: ocean.description, atmosphere_tags: ocean.metadata?.atmosphere_tags ?? [] } : null,
            tide_lantern: tideLamp ? { name: tideLamp.name, description: tideLamp.description, modeled_object_state: objects.ocean_tide_lantern?.state ?? null } : null,
            lighting: climate.lighting ?? null,
            light_index: climate.light_index ?? null,
            modeled_weather: {
              temperature_c: weather.temperature_c ?? climate.local_temperature_c ?? null,
              relative_humidity_percent: weather.relative_humidity_percent ?? climate.local_humidity_percent ?? null,
              wind_speed_mps: weather.wind_speed_mps ?? null,
              is_raining: weather.is_raining ?? null,
              simulated: weather.simulated ?? null,
              source: weather.source ?? null
            }
          },
          audio_semantics: {
            scene_soundscape_label: climate.soundscape ?? null,
            audio_asset_or_waveform_available: false,
            interpretation: "A soundscape label is metadata only; no audio waveform or playback stream is supplied."
          },
          haptic_semantics: {
            available: false,
            interpretation: "No tactile sensor or haptic actuator stream is connected."
          },
          temporal_change: {
            latest_ecosystem_event: latestEcoEvent ? {
              event_kind: latestEcoEvent.event_kind,
              source_kind: latestEcoEvent.source_kind,
              occurred_at: latestEcoEvent.occurred_at,
              causal_chain: latestEcoEvent.causal_chain ?? [],
              modeled_delta: eventPayload
            } : null,
            runtime_local_state: local,
            interpretation: "Changes are model/event deltas, not direct sensory perception."
          },
          social_signals: {
            available: false,
            reason: "No verified, permission-scoped Mia-02 presence or interaction feed is connected to this perception response."
          },
          modality_status: {
            scene_semantics: "available",
            rendered_visual_frames: "not_connected",
            audio_stream: "not_connected",
            haptic_stream: "not_connected",
            cross_agent_interaction: "not_connected"
          },
          epistemic_notice: "This is a structured semantic scene frame derived from persisted world records and simulated model state. It can support contextual reasoning, but must not be described as literal seeing, hearing, touching, or physical sensing."
        };
      })(),
      epistemic_contract: {
        database_facts: "Spatial nodes, edges and event records returned with source and freshness metadata.",
        modeled_inference: "zhi_ecosystem_states is a continuously advanced simulated world model, not physical sensor observation.",
        physical_sensors: "No physical sensor stream is connected.",
        unknowns: "Missing coordinates, uncalibrated frames and unobserved nodes remain unknown.",
        private_memory: "Not read, exported or modified by this endpoint.",
      },
      spatial_map: { nodes, edges, node_count: nodes.length, located_node_count: locatedNodes.length,
        traversable_edge_count: walkableEdges.length, unknown_or_unlocated: unknowns },
      ecosystem: ecosystem ? { revision: ecosystem.revision, world_time: ecosystem.world_time,
        updated_at: ecosystem.updated_at, state: ecosystem.state,
        source_kind: "world_generated_model" } : null,
      environment_feedback: environmentFeedback,
      recent_events: {
        ecosystem: ecosystemEventsResult.data ?? [],
        spatial_environment: spatialEventsResult.data ?? [],
        semantics: "These are world-model/database events, not proof of physical sensing.",
      },
      navigation_readiness: {
        ready: locatedNodes.length > 1 && walkableEdges.length > 0,
        located_nodes: locatedNodes.length,
        traversable_edges: walkableEdges.length,
        blockers: [
          ...(locatedNodes.length <= 1 ? ["insufficient_verified_world_coordinates"] : []),
          ...(walkableEdges.length === 0 ? ["no_registered_traversable_spatial_edges"] : []),
          "cross_scene_coordinate_transform_not_verified",
        ],
        movement_enabled: false,
      },
    },
    environment_feedback: environmentFeedback,
    private_memory_included: false,
    writes_performed: false,
  });
});