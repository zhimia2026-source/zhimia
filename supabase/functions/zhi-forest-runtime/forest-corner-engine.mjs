export const SCENE_ID = "mia-forest-corner";
export const WORLD_ID = "50b06c01-060d-49fa-8988-8f38c13406d7";
export const FRAME_ID = "forest-corner-local-v1";
export const RUNTIME_ID = "forest-corner-headless-v1";

const route = [
  { node_id: "forest-corner-left-boundary-test-entry", x: 0, y: 350 },
  { node_id: "stone-path-waypoint-01", x: 160, y: 350 },
  { node_id: "stone-path-waypoint-02", x: 320, y: 350 },
  { node_id: "stone-path-waypoint-03", x: 480, y: 350 },
  { node_id: "stone-path-waypoint-04", x: 640, y: 350 },
  { node_id: "lounge", x: 800, y: 350 },
];

export function initialState() {
  return {
    scene_id: SCENE_ID,
    coordinate_frame: FRAME_ID,
    runtime_instance_id: RUNTIME_ID,
    current_node_id: route[0].node_id,
    current_position: { x: 0, y: 350, z: null, frame: FRAME_ID },
    sequence: 0,
    session_status: "left",
    position_status: "unobserved",
    environment_state: { entities: ["greenhouse", "data-shelf", "lounge", "forest-rabbit", "tiny-planet-friends-glb"] },
  };
}

export function transition(previous, action, input = {}) {
  const state = structuredClone(previous ?? initialState());
  const events = [];
  const push = (event_type, position, payload = {}) => {
    const sequence = state.sequence + events.length + 1;
    events.push({
      sequence,
      event_type,
      position,
      payload: { ...payload, coordinate_frame: FRAME_ID, runtime_instance_id: RUNTIME_ID },
    });
  };

  if (action === "enter") {
    if (state.session_status === "active") {
      throw new Error("already_inside_scene");
    }
    state.session_status = "active";
    state.position_status = "anchored";
    push("scene_entered", state.current_position, {
      resumed: state.sequence > 0,
      current_node_id: state.current_node_id,
      source: "server_runtime_scene_entry",
    });
  } else if (action === "move_to") {
    if (state.session_status !== "active") throw new Error("scene_not_active");
    if (input.destination !== "lounge") throw new Error("destination_not_registered");
    const startIndex = route.findIndex((p) => p.node_id === state.current_node_id);
    if (startIndex < 0) throw new Error("current_node_not_on_registered_route");
    for (const waypoint of route.slice(startIndex + 1)) {
      state.current_node_id = waypoint.node_id;
      state.current_position = { x: waypoint.x, y: waypoint.y, z: null, frame: FRAME_ID };
      state.position_status = "anchored";
      push("movement_step", state.current_position, {
        node_id: waypoint.node_id,
        destination: "lounge",
        movement_model: "server_authoritative_discrete_navigation",
        route_id: "stone-path-forest-to-lounge",
      });
    }
    if (startIndex === route.length - 1) throw new Error("already_at_destination");
  } else if (action === "interact") {
    if (state.session_status !== "active") throw new Error("scene_not_active");
    if (input.target !== "lounge") throw new Error("target_not_registered_for_interaction");
    if (state.current_node_id !== "lounge") throw new Error("target_out_of_reach");
    if (!["listen", "rest"].includes(input.behavior)) throw new Error("interaction_not_supported");
    push("interaction", state.current_position, {
      target: "lounge",
      behavior: input.behavior,
      outcome: input.behavior === "listen" ? "lounge_listening_state" : "lounge_rest_state",
    });
    state.environment_state.last_interaction = {
      target: "lounge",
      behavior: input.behavior,
      occurred_at: new Date().toISOString(),
    };
  } else if (action === "leave") {
    if (state.session_status !== "active") throw new Error("scene_not_active");
    push("scene_left", state.current_position, { last_node_id: state.current_node_id });
    state.session_status = "left";
    state.position_status = "anchored";
  } else {
    throw new Error("unsupported_action");
  }

  state.sequence += events.length;
  state.updated_at = new Date().toISOString();
  return { state, events };
}

export function sceneSnapshot(state) {
  return {
    scene_id: SCENE_ID,
    world_id: WORLD_ID,
    runtime_instance_id: RUNTIME_ID,
    coordinate_frame: FRAME_ID,
    coordinate_space: "scene-local",
    world_transform: null,
    world_transform_status: "uncalibrated",
    current_node_id: state?.current_node_id ?? null,
    current_position: state?.current_position ?? null,
    sequence: state?.sequence ?? 0,
    session_status: state?.session_status ?? "not_entered",
    position_status: state?.position_status ?? "unobserved",
    environment_state: state?.environment_state ?? {},
    route: route.map((point) => ({ ...point })),
  };
}
