import { assertEquals } from "jsr:@std/assert@1";
import { computeSceneEnvironment } from "./environment_helpers.ts";

Deno.test("computes local temporal rhythm using the scene timezone", () => {
  const result = computeSceneEnvironment({ timezone: "Asia/Singapore" }, new Date("2026-10-30T22:30:00.000Z"));
  assertEquals(result.temporal_state, "dawn");
  assertEquals(result.scene_time.local_time, "06:30");
});

Deno.test("daily event tide overlays atmosphere, object microstate and behavior weights", () => {
  const result = computeSceneEnvironment({
    timezone: "Asia/Singapore",
    objects: [{ id: "oak-shelter", name: "橡树屋檐", state: "dry", interaction_options: ["rest", "observe"] }],
    events: [{
      id: "forest-rain",
      type: "rain",
      label: "林间阵雨",
      daily_window: { start: "14:00", end: "16:00" },
      state_delta: {
        lighting: "overcast",
        soundscape: "rain_on_leaves",
        atmosphere_tags: ["rain", "cool"],
        object_states: { "oak-shelter": "wet_roof" },
      },
      behavior_weights: { seek_shelter: 0.9 },
    }],
  }, new Date("2026-10-30T07:00:00.000Z"));
  assertEquals(result.temporal_state, "afternoon");
  assertEquals(result.lighting, "overcast");
  assertEquals(result.soundscape, "rain_on_leaves");
  assertEquals(result.objects[0].state, "wet_roof");
  assertEquals(result.objects[0].interaction_options, ["rest", "observe"]);
  assertEquals(result.behavior_weights.seek_shelter, 0.9);
  assertEquals(result.active_events[0].id, "forest-rain");
});

Deno.test("does not activate an event outside its local window", () => {
  const result = computeSceneEnvironment({
    timezone: "Asia/Singapore",
    events: [{ id: "rain", daily_window: { start: "14:00", end: "16:00" }, state_delta: { lighting: "dark" } }],
  }, new Date("2026-10-30T22:30:00.000Z"));
  assertEquals(result.active_events.length, 0);
  assertEquals(result.lighting, "natural");
});

Deno.test("falls back safely for invalid timezone and clamps behavior weights", () => {
  const result = computeSceneEnvironment({ timezone: "Not/A_Timezone", behavior_weights: { seek_shelter: 9 } }, new Date("2026-10-30T06:00:00.000Z"));
  assertEquals(result.scene_time.timezone, "UTC");
  assertEquals(result.behavior_weights.seek_shelter, 1);
});
