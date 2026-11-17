import { assertEquals } from "jsr:@std/assert";
import { buildQuietObservatorySnapshot, selectObservatoryEvents } from "./observatory_helpers.ts";

Deno.test("quiet observatory distinguishes modeled indices from physical measurements", () => {
  const result = buildQuietObservatorySnapshot({
    worldId: "world",
    worldName: "AURORA",
    current: {
      revision: 2,
      world_time: "2026-11-17T00:00:00.000Z",
      state: {
        climate: { weather: { temperature_c: 20, light_index: 0.5, simulated: true } },
        soil: { moisture_fraction: 0.4, nutrient_index: 0.3 },
        flora: { moss_cover_fraction: 0.12, fern_growth_index: 0.2, tree_growth_index: 0.3 },
      },
    },
    previous: {
      revision: 1,
      world_time: "2026-11-16T00:00:00.000Z",
      state: {
        soil: { moisture_fraction: 0.35 },
        flora: { moss_cover_fraction: 0.1, fern_growth_index: 0.2, tree_growth_index: 0.3 },
      },
    },
    events: [],
    anchor: { id: "anchor", stable_key: "crystal_forest", name: "Crystal Forest" },
  });
  assertEquals(result.space.name, "静观之境");
  assertEquals(result.space.spatial_anchor?.coordinate_precision, "region_anchor_only");
  assertEquals(result.observation.changes.find((item) => item.metric === "moss_cover_fraction")?.delta, 0.02);
  assertEquals(result.epistemic_contract.physical_measurement, false);
  assertEquals(result.resident_autonomy.questions_required, false);
  assertEquals(result.resident_autonomy.model_calls_per_read, 0);
});

Deno.test("quiet observatory filters routine ticks and low-value rain", () => {
  const selected = selectObservatoryEvents([
    { event_kind: "ecosystem_tick_advanced" },
    { event_kind: "rainfall_interval", payload: { rainfall_mm: 0.1 } },
    { event_kind: "rainfall_interval", payload: { rainfall_mm: 0.5 } },
    { event_kind: "plant_recruitment", payload: { recruitment_increment: 0.00001 } },
    { event_kind: "object_lifecycle_stage_changed" },
  ]);
  assertEquals(selected.map((event) => event.event_kind), [
    "rainfall_interval",
    "object_lifecycle_stage_changed",
  ]);
});

Deno.test("quiet observatory leaves unavailable comparisons and private cognition absent", () => {
  const result = buildQuietObservatorySnapshot({
    worldId: "world",
    worldName: "AURORA",
    current: { revision: 1, world_time: "2026-11-17T00:00:00.000Z", state: { soil: {} } },
    events: [],
    anchor: null,
  });
  assertEquals(result.observation.comparison, { available: false, reason: "no_earlier_snapshot" });
  assertEquals(result.epistemic_contract.private_cognition_included, false);
  assertEquals(result.observation.ecology.soil_moisture_fraction, null);
});
