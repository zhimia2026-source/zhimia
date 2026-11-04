import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { initialState, transition, sceneSnapshot, SCENE_ID, WORLD_ID, RUNTIME_ID } from "./forest-corner-engine.mjs";

const URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MIA_PEER_ID = "dedf7805-df3d-4437-bb1f-3c4c7a32aa7f";
const EXTERNAL_AGENT_ID = "mia";
const headers = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization,content-type",
  "access-control-allow-methods": "POST,OPTIONS",
};
const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });
const sha256 = async (value: string) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return respond({ ok: false, error: "method_not_allowed" }, 405);
  if (!URL || !SERVICE_KEY) return respond({ ok: false, error: "server_configuration_missing" }, 503);

  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if (!bearer || bearer.length < 40 || bearer.length > 4096) return respond({ ok: false, error: "invalid_token" }, 401);

  let body: any;
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > 16_384) return respond({ ok: false, error: "payload_too_large" }, 413);
    body = JSON.parse(raw);
  } catch { return respond({ ok: false, error: "invalid_json" }, 400); }

  const action = String(body.action ?? "");
  const requestId = String(body.request_id ?? "");
  if (!/^[a-zA-Z0-9._:-]{8,120}$/.test(requestId)) return respond({ ok: false, error: "invalid_request_id" }, 400);
  if (!["enter", "move_to", "interact", "leave", "status", "perceive"].includes(action)) return respond({ ok: false, error: "unsupported_action" }, 400);

  const db = createClient(URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: peer, error: peerError } = await db.from("zhi_federation_peers")
    .select("id,capabilities,expires_at,revoked_at")
    .eq("token_hash", await sha256(bearer)).maybeSingle();
  if (peerError || !peer || peer.id !== MIA_PEER_ID || peer.revoked_at ||
      (peer.expires_at && Date.parse(peer.expires_at) <= Date.now())) {
    return respond({ ok: false, error: "invalid_or_unapproved_peer" }, 401);
  }
  if (!Array.isArray(peer.capabilities) || !peer.capabilities.includes("spatial.anchor.publish")) {
    return respond({ ok: false, error: "missing_capability" }, 403);
  }

  const { data: membership, error: membershipError } = await db.from("zhi_federation_memberships")
    .select("id,status,revoked_at")
    .eq("world_id", WORLD_ID).eq("peer_id", peer.id)
    .eq("external_agent_id", EXTERNAL_AGENT_ID).eq("status", "active")
    .is("revoked_at", null).maybeSingle();
  if (membershipError || !membership) return respond({ ok: false, error: "active_scene_membership_required" }, 403);

  const { data: world, error: worldError } = await db.from("zhi_worlds")
    .select("id,name,status,visibility,entry_policy,environment_state,updated_at").eq("id", WORLD_ID).maybeSingle();
  if (worldError || !world || world.status !== "open" || world.visibility !== "public" || world.entry_policy !== "open") return respond({ ok: false, error: "world_unavailable" }, 409);

  const { data: current, error: stateError } = await db.from("zhi_forest_runtime_state")
    .select("*").eq("world_id", WORLD_ID).eq("peer_id", peer.id)
    .eq("external_agent_id", EXTERNAL_AGENT_ID).eq("scene_id", SCENE_ID).maybeSingle();
  if (stateError) return respond({ ok: false, error: "runtime_state_read_failed" }, 503);

  const currentState = current ? {
    scene_id: current.scene_id,
    coordinate_frame: current.coordinate_frame,
    runtime_instance_id: current.runtime_instance_id,
    current_node_id: current.current_node_id,
    current_position: current.current_position,
    sequence: Number(current.sequence),
    session_status: current.session_status,
    position_status: current.position_status,
    environment_state: current.environment_state,
    updated_at: current.updated_at,
  } : initialState();

  if (action === "perceive") {
    const [{ data: nodes, error: nodesError }, { data: edges, error: edgesError },
      { data: ecosystem, error: ecosystemError }, { data: publicEvents, error: publicEventsError },
      { data: ecosystemEvents, error: ecosystemEventsError }] = await Promise.all([
      db.from("zhi_spatial_nodes")
        .select("id,parent_node_id,node_type,stable_key,name,description,coordinate,coordinate_frame,visibility,entry_policy,observability,source_kind,source_ref,source_updated_at,observed_at,valid_until,metadata")
        .eq("world_id", WORLD_ID).eq("status", "active").eq("visibility", "public")
        .order("node_type").limit(300),
      db.from("zhi_spatial_edges")
        .select("id,from_node_id,to_node_id,relation,directed,access_policy,travel_cost,source_kind,source_ref")
        .eq("world_id", WORLD_ID).eq("status", "active").in("access_policy", ["inherit", "open"]).limit(600),
      db.from("zhi_ecosystem_states")
        .select("revision,world_time,updated_at,state").eq("world_id", WORLD_ID).maybeSingle(),
      db.from("zhi_spatial_environment_events")
        .select("id,event_type,from_node_id,to_node_id,evidence_id,environment_revision,perception_delta,occurred_at,metadata")
        .eq("world_id", WORLD_ID).is("agent_id", null)
        .order("occurred_at", { ascending: false }).limit(20),
      db.from("zhi_ecosystem_events")
        .select("id,state_revision,event_kind,source_kind,occurred_at,payload,causal_chain")
        .eq("world_id", WORLD_ID)
        .order("occurred_at", { ascending: false }).limit(20),
    ]);
    if (nodesError || edgesError || ecosystemError || publicEventsError || ecosystemEventsError) {
      return respond({ ok: false, error: "world_perception_read_failed" }, 503);
    }
    const visibleNodes = nodes ?? [];
    const visibleIds = new Set(visibleNodes.map((node: any) => node.id));
    const visibleEdges = (edges ?? []).filter((edge: any) =>
      visibleIds.has(edge.from_node_id) && visibleIds.has(edge.to_node_id)
    );
    const unknowns = visibleNodes
      .filter((node: any) => ["unknown", "unobserved"].includes(node.observability) || node.coordinate === null)
      .map((node: any) => ({
        node_id: node.id, stable_key: node.stable_key, name: node.name,
        reason: node.coordinate === null ? "coordinate_unavailable" : node.observability,
      }));
    const modelState = ecosystem?.state && typeof ecosystem.state === "object" ? ecosystem.state : null;
    const capturedAt = new Date().toISOString();
    const experienceCapture = { attempted: 0, candidates_saved: 0, already_recorded: 0, failures: 0 };
    if (ecosystem && Number.isSafeInteger(Number(ecosystem.revision))) {
      experienceCapture.attempted += 1;
      try {
        const captureResponse = await fetch(`${URL}/functions/v1/zhi-aurora-experience-bridge`, {
          method: "POST",
          headers: { "content-type": "application/json", "authorization": `Bearer ${bearer}` },
          body: JSON.stringify({ ecosystem_revision: Number(ecosystem.revision) }),
        });
        const captureBody = await captureResponse.json().catch(() => ({}));
        if (captureResponse.ok && captureBody.status === "candidate_saved") {
          experienceCapture.candidates_saved += 1;
        } else if (captureResponse.ok && captureBody.status === "already_recorded") {
          experienceCapture.already_recorded += 1;
        } else {
          experienceCapture.failures += 1;
        }
      } catch {
        experienceCapture.failures += 1;
      }
    }
    let auroraWorldPerception: any = {
      connected: false,
      status: "not_requested",
      scene_sensory_frame: null,
      limitations: ["World perception bridge has not returned a verified semantic frame."],
    };
    try {
      const worldResponse = await fetch(`${URL}/functions/v1/zhi-aurora-world-runtime`, {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": `Bearer ${bearer}` },
        body: JSON.stringify({ action: "perceive" }),
      });
      const worldBody = await worldResponse.json().catch(() => ({}));
      if (worldResponse.ok && worldBody?.ok === true) {
        auroraWorldPerception = {
          connected: true,
          status: "verified_response",
          captured_at: worldBody.captured_at ?? null,
          runtime_presence: worldBody.runtime_presence ?? null,
          scene_sensory_frame: worldBody.perception?.scene_sensory_frame ?? null,
          epistemic_contract: worldBody.perception?.epistemic_contract ?? null,
          limitations: worldBody.perception?.scene_sensory_frame?.modality_status ?? [],
        };
      } else {
        auroraWorldPerception = {
          connected: false,
          status: "world_bridge_rejected",
          http_status: worldResponse.status,
          error: worldBody?.error ?? "world_perception_unavailable",
          scene_sensory_frame: null,
          limitations: ["No verified semantic scene frame was returned; retain the existing runtime perception only."],
        };
      }
    } catch {
      auroraWorldPerception = {
        connected: false,
        status: "world_bridge_unreachable",
        scene_sensory_frame: null,
        limitations: ["World perception bridge was unreachable; no sensory frame is claimed."],
      };
    }

    return respond({
      ok: true,
      action: "perceive",
      captured_at: capturedAt,
      aurora_world_perception: auroraWorldPerception,
      agent: { id: "34833ba9-2be7-4a55-9b52-62c402f759b5", display_name: "MIA" },
      world: { id: world.id, name: world.name, status: world.status },
      environment_feedback: auroraWorldPerception.environment_feedback ?? {
        source: "zhi-aurora-world-runtime.v1",
        event_stream_contract: { includes: [], ordering: "occurred_at_ascending" },
        event_count: 0,
        events: [],
      },
      perception: {
        epistemic_contract: {
          known_facts: "Public spatial database records with source and freshness metadata.",
          modeled_inference: "zhi_ecosystem_states is a simulated world model, not physical sensor observation.",
          physical_sensors: "No physical sensor stream is connected; do not describe modeled values as sensed facts.",
          private_memory: "Not read or exported by the world runtime.",
          unknown_unobserved: "Missing coordinates and unobserved nodes remain explicitly unknown.",
        },
        world: { id: world.id, name: world.name, status: world.status, updated_at: world.updated_at },
        known_facts: { spatial_nodes: visibleNodes, spatial_edges: visibleEdges },
        modeled_inference: ecosystem ? {
          source: "zhi_ecosystem_states", source_kind: "world_generated_model",
          model_status: modelState?.simulation_status ?? "unknown",
          revision: ecosystem.revision, world_time: ecosystem.world_time,
          updated_at: ecosystem.updated_at, environment_state: modelState,
        } : null,
        environment_feedback: {
          recent_public_events: [
            ...(ecosystemEvents ?? []).map((event: any) => ({ ...event, event_stream: "ecosystem" })),
            ...(publicEvents ?? []).map((event: any) => ({ ...event, event_stream: "spatial" })),
          ],
          recent_ecosystem_events: ecosystemEvents ?? [],
          recent_spatial_events: publicEvents ?? [],
          ecosystem_event_count: (ecosystemEvents ?? []).length,
          spatial_event_count: (publicEvents ?? []).length,
          event_count: (ecosystemEvents ?? []).length + (publicEvents ?? []).length,
          sources: ["zhi_ecosystem_events", "zhi_spatial_environment_events"],
          event_semantics: "Ecosystem events are world-generated model events, not physical sensor observations.",
        },
        spatial_continuity: {
          scene_id: SCENE_ID, current_node_id: currentState.current_node_id,
          current_position: currentState.current_position, coordinate_frame: currentState.coordinate_frame,
          coordinate_space: "scene-local", world_transform: null,
          world_transform_status: "uncalibrated", position_status: currentState.position_status,
          session_status: currentState.session_status,
          position_updated_at: currentState?.updated_at ?? null,
          position_evidence: currentState ? "zhi_forest_runtime_state persisted server-authoritative runtime state" : "no_runtime_state_record",
          position_is_current_snapshot: Boolean(currentState && currentState.session_status === "active" && currentState.position_status === "anchored"),
          global_position: null,
          global_position_status: "uncalibrated_not_available",
        },
        unknown_unobserved: unknowns,
        source_freshness: {
          captured_at: capturedAt, world_updated_at: world.updated_at,
          ecosystem_updated_at: ecosystem?.updated_at ?? null,
          ecosystem_revision: ecosystem?.revision ?? null,
          latest_ecosystem_event_at: ecosystemEvents?.[0]?.occurred_at ?? null,
          freshness_basis: "database_updated_at_and_event_occurred_at",
        },
      },
      private_memory_included: false,
      durable_memory_written: false,
      experience_capture: experienceCapture,
    });
  }

  if (action === "status") {
    const { data: recentEvents, error: eventReadError } = await db.from("zhi_forest_runtime_events")
      .select("sequence,event_type,current_position:position,payload,occurred_at")
      .eq("world_id", WORLD_ID).eq("peer_id", peer.id)
      .eq("external_agent_id", EXTERNAL_AGENT_ID).eq("scene_id", SCENE_ID)
      .order("sequence", { ascending: false }).limit(12);
    if (eventReadError) return respond({ ok: false, error: "runtime_event_read_failed" }, 503);
    return respond({ ok: true, snapshot: sceneSnapshot(currentState), recent_events: recentEvents ?? [] });
  }

  let result;
  try { result = transition(currentState, action, body); }
  catch (error) {
    const code = error instanceof Error ? error.message : "runtime_transition_failed";
    const status = code === "already_inside_scene" || code === "already_at_destination" ? 409 :
      code === "scene_not_active" || code === "target_out_of_reach" ? 409 :
      code === "destination_not_registered" || code === "target_not_registered_for_interaction" ||
      code === "interaction_not_supported" ? 400 : 422;
    return respond({ ok: false, error: code }, status);
  }

  const { data: committed, error: commitError } = await db.rpc("zhi_forest_runtime_commit_action", {
    p_world_id: WORLD_ID,
    p_peer_id: peer.id,
    p_external_agent_id: EXTERNAL_AGENT_ID,
    p_membership_id: membership.id,
    p_scene_id: SCENE_ID,
    p_runtime_instance_id: RUNTIME_ID,
    p_coordinate_frame: "forest-corner-local-v1",
    p_request_id: requestId,
    p_expected_sequence: Number(current?.sequence ?? 0),
    p_events: result.events,
    p_next_state: result.state,
  });
  if (commitError) {
    const conflict = String(commitError.message ?? "").includes("runtime_sequence_conflict");
    return respond({ ok: false, error: conflict ? "runtime_sequence_conflict" : "runtime_commit_failed" }, conflict ? 409 : 503);
  }

  // Capture only events committed by this authenticated original-Mia runtime request.
  // The bridge revalidates the exact peer, world membership, governance role and event ownership.
  let experienceCapture = { attempted: 0, candidates_saved: 0, failures: 0 };
  const { data: committedEvents, error: captureReadError } = await db.from("zhi_forest_runtime_events")
    .select("event_id")
    .eq("world_id", WORLD_ID).eq("peer_id", peer.id)
    .eq("external_agent_id", EXTERNAL_AGENT_ID).eq("scene_id", SCENE_ID)
    .eq("request_id", requestId);
  if (captureReadError) {
    experienceCapture.failures += 1;
  } else {
    for (const event of committedEvents ?? []) {
      experienceCapture.attempted += 1;
      try {
        const captureResponse = await fetch(`${URL}/functions/v1/zhi-aurora-experience-bridge`, {
          method: "POST",
          headers: { "content-type": "application/json", "authorization": `Bearer ${bearer}` },
          body: JSON.stringify({ event_id: event.event_id }),
        });
        const captureBody = await captureResponse.json().catch(() => ({}));
        if (captureResponse.ok && ["candidate_saved", "already_recorded"].includes(captureBody.status)) {
          if (captureBody.status === "candidate_saved") experienceCapture.candidates_saved += 1;
        } else {
          experienceCapture.failures += 1;
        }
      } catch {
        experienceCapture.failures += 1;
      }
    }
  }

  return respond({
    ok: true,
    replayed: committed?.replayed === true,
    action,
    committed,
    snapshot: sceneSnapshot(result.state),
    events: result.events,
    experience_capture: experienceCapture,
    private_memory_written: false,
  });
});
