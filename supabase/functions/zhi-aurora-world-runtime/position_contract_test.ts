import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildPositionAwareness } from "./position_contract.ts";

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
  assertEquals(result.current_presence.status, "unknown");
  assertEquals(result.last_known_position?.status, "historical");
  assertEquals(result.last_known_position?.local_coordinates, { x: 800, y: 350 });
  assertEquals(result.last_known_world_presence?.node_id, "aurora-root");
  assertEquals(result.position_confidence.level, "unknown");
  assertEquals(result.coordinate_calibration, "uncalibrated_not_available");
});

Deno.test("fresh active federated movement is a modeled current snapshot, not physical proof", () => {
  const result = buildPositionAwareness(
    { session_status: "active", closed_at: null },
    { current_node_id: "crystal-forest", position_status: "inferred", provenance: "modeled_inference",
      revision: 2, updated_at: "2026-11-04T11:59:00.000Z" },
    null,
    now,
  );
  assertEquals(result.current_presence.status, "inferred");
  assertEquals(result.current_presence.position_is_current_snapshot, true);
  assertEquals(result.current_presence.physical_observation, false);
  assertEquals(result.position_confidence.level, "modeled_inference");
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
  assertEquals(stale.current_presence.status, "unknown");
  assertEquals(closed.current_presence.status, "unknown");
});
