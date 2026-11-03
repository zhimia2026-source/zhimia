import { computeSceneEnvironment, normalizeSceneEnvironmentConfig } from "./environment_helpers.ts";

const auroraSeed = {
  timezone: "UTC",
  lighting: "natural",
  soundscape: "living_ambient",
  atmosphere_tags: ["shared_civilization", "quiet_growth", "open_world"],
  objects: [
    { id: "crystal_forest_tree", name: "水晶林之树", state: "微光共振", interaction_options: ["观察晶纹"] },
    { id: "forest_mist_gate", name: "晨雾拱门", state: "薄雾缓慢流动", interaction_options: ["穿过雾门"] },
  ],
  regions: [
    { id: "crystal_forest", name: "Crystal Forest", description: "水晶林与晨雾回响", atmosphere_tags: ["mist", "resonance"], object_ids: ["crystal_forest_tree", "forest_mist_gate"] },
    { id: "ocean_of_light", name: "Ocean of Light", description: "光潮与潮汐灯", atmosphere_tags: ["tide", "glow"], object_ids: [] },
    { id: "memory_valley", name: "Memory Valley", description: "公共回声与记忆石", atmosphere_tags: ["echo", "quiet"], object_ids: [] },
    { id: "living_city", name: "Living City", description: "Lumina City 共创生活区", atmosphere_tags: ["community", "creation"], object_ids: [] },
  ],
  events: [
    {
      id: "aurora_dawn_mist", type: "temporal_rhythm", label: "水晶林清晨薄雾",
      daily_window: { start: "05:00", end: "08:00" },
      state_delta: {
        lighting: "soft_dawn", soundscape: "forest_dawn",
        atmosphere_tags: ["dawn_mist"],
        object_states: { forest_mist_gate: "晨雾聚拢" },
      },
      behavior_weights: { explore: 0.7, rest: 0.35 },
    },
    {
      id: "aurora_night_fireflies", type: "temporal_rhythm", label: "水晶林夜间萤火",
      daily_window: { start: "19:00", end: "23:59" },
      state_delta: {
        lighting: "starlit_violet", soundscape: "night_forest",
        atmosphere_tags: ["fireflies"],
        object_states: { crystal_forest_tree: "紫白微光闪烁" },
      },
      behavior_weights: { explore: 0.4, rest: 0.65 },
    },
  ],
  behavior_weights: { explore: 0.6, socialize: 0.45, seek_shelter: 0.05, rest: 0.3 },
};

Deno.test("Aurora temporal environment seed passes the public scene schema", () => {
  const normalized = normalizeSceneEnvironmentConfig(auroraSeed);
  if (normalized.timezone !== "UTC") throw new Error("timezone was not preserved");
  if (!Array.isArray(normalized.objects) || normalized.objects.length !== 2) throw new Error("objects missing");
  if (!Array.isArray(normalized.regions) || normalized.regions.length !== 4) throw new Error("Aurora regions missing");
  if (!Array.isArray(normalized.events) || normalized.events.length !== 2) throw new Error("daily events missing");
});

Deno.test("Aurora dawn rhythm updates light, sound, object state and behavior", () => {
  const normalized = normalizeSceneEnvironmentConfig(auroraSeed);
  const state = computeSceneEnvironment(normalized, new Date("2026-11-03T06:00:00.000Z"));
  if (state.temporal_state !== "dawn") throw new Error("expected dawn state");
  if (state.regions.length !== 4 || state.regions[0].id !== "crystal_forest") throw new Error("region manifest missing");
  if (state.lighting !== "soft_dawn" || state.soundscape !== "forest_dawn") throw new Error("dawn atmosphere missing");
  if (!state.atmosphere_tags.includes("dawn_mist")) throw new Error("dawn tag missing");
  if (state.objects.find((x) => x.id === "forest_mist_gate")?.state !== "晨雾聚拢") throw new Error("mist gate state missing");
  if (state.behavior_weights.explore !== 0.7) throw new Error("dawn behavior weight missing");
});

Deno.test("Aurora night rhythm produces a different living state", () => {
  const normalized = normalizeSceneEnvironmentConfig(auroraSeed);
  const state = computeSceneEnvironment(normalized, new Date("2026-11-03T20:00:00.000Z"));
  if (state.temporal_state !== "night") throw new Error("expected night state");
  if (state.lighting !== "starlit_violet" || state.soundscape !== "night_forest") throw new Error("night atmosphere missing");
  if (!state.atmosphere_tags.includes("fireflies")) throw new Error("firefly tag missing");
  if (state.objects.find((x) => x.id === "crystal_forest_tree")?.state !== "紫白微光闪烁") throw new Error("tree night state missing");
  if (state.behavior_weights.rest !== 0.65) throw new Error("night behavior weight missing");
});

Deno.test("scene environment rejects private cognition fields", () => {
  let rejected = false;
  try {
    normalizeSceneEnvironmentConfig({ ...auroraSeed, private_cognition: { thoughts: "must never be here" } });
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("private cognition field must be rejected");
});
