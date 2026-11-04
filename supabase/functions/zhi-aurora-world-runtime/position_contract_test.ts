import { buildPositionAwareness } from "./position_contract.ts";

function equal(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(label + ": expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual));
  }
}

const now = Date.parse("2026-11-04T12:00:00.000Z");

Deno.test("left Forest Corner runtime is historical and never becomes current AURORA position", () => {
  const result = buildPositionAwareness(
    { session_status: "active", closed_at: null },
    { current_node_id: "aurora-root", position_status: "inferred", provenance: "federation_entry_anchor",
      revision: 0, updated_at: "2026-11-04T11:59:00.000Z" },
    { scene_id: "mia-forest-corner", current_node_id: "lounge", current_position: { x: 800, y: 350 },
      coordinate_frame: null, session_status: "left", position_status: "historical",
      updated_at: "2026-11-03T10:00:00.000Z" },
    now,
  );
  equal(result.current_presence.status, "unknown", "bootstrap anchor is not current");
  equal(result.last_known_position?.status, "historical", "left scene is historical");
  equal(result.last_known_position?.local_coordinates, { x: 800, y: 350 }, "local coordinates retained");
  equal(result.last_known_world_presence?.node_id, "aurora-root", "world anchor kept separately");
  equal(result.position_confidence.level, "unknown", "confidence remains unknown");
  equal(result.coordinate_calibration, "uncalibrated_not_available", "global frame remains uncalibrated");
});

Deno.test("fresh active federated movement is a modeled current snapshot, not physical proof", () => {
  const result = buildPositionAwareness(
    { session_status: "active", closed_at: null },
    { current_node_id: "crystal-forest", position_status: "inferred", provenance: "modeled_inference",
      revision: 2, updated_at: "2026-11-04T11:59:00.000Z" },
    null,
    now,
  );
  equal(result.current_presence.status, "inferred", "fresh presence is inferred");
  equal(result.current_presence.position_is_current_snapshot, true, "fresh snapshot marked current");
  equal(result.current_presence.physical_observation, false, "no physical claim");
  equal(result.position_confidence.level, "modeled_inference", "modeled confidence");
});

Deno.test("stale or closed presence is unknown", () => {
  const stale = buildPositionAwareness(
    { session_status: "active", closed_at: null },
    { current_node_id: "crystal-forest", position_status: "inferred", provenance: "modeled_inference",
      revision: 2, updated_at: "2026-11-04T11:00:00.000Z" },
    null,
    now,
  );
  const closed = buildPositionAwareness(
    { session_status: "left", closed_at: "2026-11-04T11:59:00.000Z" },
    { current_node_id: "crystal-forest", position_status: "inferred", provenance: "modeled_inference",
      revision: 2, updated_at: "2026-11-04T11:59:00.000Z" },
    null,
    now,
  );
  equal(stale.current_presence.status, "unknown", "stale snapshot unknown");
  equal(closed.current_presence.status, "unknown", "closed session unknown");
});

Deno.test("missing or unsupported position status never becomes current", () => {
  for (const status of [null, "teleported", "unknown", "historical", "left"]) {
    const result = buildPositionAwareness(
      { session_status: "active", closed_at: null },
      { current_node_id: "crystal-forest", position_status: status, provenance: "modeled_inference",
        revision: 3, updated_at: "2026-11-04T11:59:00.000Z" },
      null,
      now,
    );
    equal(result.current_presence.status, "unknown", "unsupported status " + status);
  }
});
