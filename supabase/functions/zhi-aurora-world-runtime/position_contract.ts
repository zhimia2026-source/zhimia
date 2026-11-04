export type FederationSession = {
  session_status?: string | null;
  closed_at?: string | null;
};
export type FederatedPresence = {
  current_node_id?: string | null;
  position_status?: string | null;
  provenance?: string | null;
  revision?: number | null;
  updated_at?: string | null;
};
export type SceneRuntimeState = {
  scene_id?: string | null;
  current_node_id?: string | null;
  current_position?: unknown;
  coordinate_frame?: string | null;
  session_status?: string | null;
  position_status?: string | null;
  updated_at?: string | null;
};

const UNKNOWN = { status: "unknown", reason: "no_fresh_confirmed_world_presence" } as const;

/**
 * Separates AURORA's federated world presence from a scene runtime's local
 * coordinates. A bootstrap entry anchor is not evidence of arrival or travel.
 * "current" here means a fresh modeled world snapshot, never physical telemetry.
 */
export function buildPositionAwareness(
  session: FederationSession | null,
  presence: FederatedPresence | null,
  sceneRuntime: SceneRuntimeState | null,
  nowMs = Date.now(),
  freshnessMs = 30 * 60 * 1000,
) {
  const updatedAt = presence?.updated_at ? Date.parse(presence.updated_at) : Number.NaN;
  const fresh = Number.isFinite(updatedAt) && nowMs >= updatedAt && nowMs - updatedAt <= freshnessMs;
  const activeSession = session?.session_status === "active" && !session?.closed_at;
  const supportedPresenceStatus = ["anchored", "inferred"].includes(
    String(presence?.position_status ?? "").toLowerCase(),
  );
  const hasRealWorldUpdate = Boolean(
    presence?.current_node_id &&
    presence.provenance !== "federation_entry_anchor" &&
    supportedPresenceStatus
  );
  const currentPresence = activeSession && fresh && hasRealWorldUpdate
    ? {
        status: presence?.position_status === "anchored" ? "anchored" : "inferred",
        current_node_id: presence?.current_node_id ?? null,
        position_is_current_snapshot: true,
        provenance: presence?.provenance ?? null,
        revision: presence?.revision ?? null,
        updated_at: presence?.updated_at ?? null,
        physical_observation: false,
      }
    : { ...UNKNOWN };

  const lastKnownPosition = sceneRuntime ? {
    status: sceneRuntime.session_status === "left" ? "historical" : "scene_scoped",
    scene_id: sceneRuntime.scene_id ?? null,
    node_id: sceneRuntime.current_node_id ?? null,
    local_coordinates: sceneRuntime.current_position ?? null,
    coordinate_frame: sceneRuntime.coordinate_frame ?? null,
    position_is_current_snapshot: false,
    session_status: sceneRuntime.session_status ?? null,
    position_status: sceneRuntime.position_status ?? null,
    updated_at: sceneRuntime.updated_at ?? null,
  } : null;

  const lastKnownWorldPresence = presence?.current_node_id ? {
    status: "last_known",
    node_id: presence.current_node_id,
    provenance: presence.provenance ?? null,
    revision: presence.revision ?? null,
    updated_at: presence.updated_at ?? null,
    position_is_current_snapshot: false,
  } : null;

  return {
    current_presence: currentPresence,
    last_known_position: lastKnownPosition,
    last_known_world_presence: lastKnownWorldPresence,
    position_confidence: currentPresence.status === "unknown"
      ? { level: "unknown", reason: "no_fresh_confirmed_world_presence" }
      : { level: "modeled_inference", reason: "fresh_federated_world_presence_snapshot" },
    coordinate_calibration: sceneRuntime?.coordinate_frame
      ? "scene_local_frame_only"
      : "uncalibrated_not_available",
    physical_position_verified: false,
  };
}
