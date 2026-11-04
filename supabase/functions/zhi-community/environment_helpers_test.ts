import { computeSceneEnvironment, normalizeSceneEnvironmentConfig } from "./environment_helpers.ts";
import { buildSceneAwarenessContext } from "./chat_context_helpers.ts";

const auroraSeed = {
  timezone: "UTC",
  lighting: "natural",
  soundscape: "living_ambient",
  atmosphere_tags: ["shared_civilization", "quiet_growth", "open_world"],
  shared_symbols: { ken_mia_heart: { id: "ken_mia_heart", name: "Ken&Mia 跳动之心", inscription: "Ken&Mia", visibility: "all_agents_in_world", kind: "shared_living_symbol", rendering: { form: "luminous_crystalline_heart", motion: "continuous_gentle_heartbeat", pulse_cycle_ms: 1800, palette: ["amber_gold", "violet", "ice_blue"], center_text: "Ken&Mia", orbiting_light_ribbons: true, spark_particles: true } } },
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


Deno.test("weather and object micro-states evolve through a natural event", () => {
  const config = normalizeSceneEnvironmentConfig({
    ...auroraSeed,
    weather: { condition: "clear", intensity: 0, temperature_c: 24, humidity_pct: 65, wind_level: "light", visibility: "clear" },
    objects: [
      { id: "canopy", name: "林间树冠", state: "舒展", micro_state: { activity: "swaying", motion: "gentle", surface: "dry", vitality: 0.8 } },
    ],
    regions: [],
    events: [{
      id: "forest_rain",
      type: "natural_event",
      label: "林间骤雨",
      daily_window: { start: "14:00", end: "15:00" },
      state_delta: {
        lighting: "clouded",
        soundscape: "forest_rain",
        weather: { condition: "rain", intensity: 0.8, humidity_pct: 98, wind_level: "gusty", visibility: "misty" },
        object_states: { canopy: "雨滴沿叶脉滑落" },
        object_micro_states: { canopy: { activity: "dripping", motion: "shivering", surface: "wet", vitality: 0.9 } },
        atmosphere_tags: ["rainfall", "shelter_seeking"],
      },
      behavior_weights: { seek_shelter: 0.85 },
    }],
  });
  const state = computeSceneEnvironment(config, new Date("2026-11-03T14:30:00.000Z"));
  if (state.weather.condition !== "rain" || state.weather.intensity !== 0.8) throw new Error("weather event not applied");
  if (state.objects[0].micro_state.activity !== "dripping" || state.objects[0].micro_state.surface !== "wet") {
    throw new Error("object micro-state did not evolve");
  }
  if (state.behavior_weights.seek_shelter !== 0.85) throw new Error("natural event behavior weight missing");
});

Deno.test("weather values outside the declared physical bounds are rejected to defaults", () => {
  const config = normalizeSceneEnvironmentConfig({ ...auroraSeed, weather: { condition: "storm", intensity: 9, humidity_pct: 150 } });
  const state = computeSceneEnvironment(config, new Date("2026-11-03T12:00:00.000Z"));
  if (state.weather.intensity !== 0 || state.weather.humidity_pct !== null) throw new Error("weather bounds were not enforced");
});


Deno.test("Agent scene awareness includes weather and object micro-state", () => {
  const config = normalizeSceneEnvironmentConfig({
    timezone: "UTC",
    weather: { condition: "rain", intensity: 0.7, temperature_c: 18, humidity_pct: 95, wind_level: "moderate", visibility: "misty" },
    objects: [{ id: "canopy", name: "树冠", state: "滴水", micro_state: { activity: "dripping", motion: "shivering", surface: "wet", vitality: 0.9 }, interaction_options: ["观察雨滴"] }],
  });
  const environment = computeSceneEnvironment(config, new Date("2026-11-03T14:30:00.000Z"));
  const context = JSON.parse(buildSceneAwarenessContext({ name: "Aurora", description: "Living world", visibility: "public" }, environment));
  if (context.weather.condition !== "rain" || context.weather.intensity !== 0.7) throw new Error("Agent did not receive weather context");
  if (context.objects[0].micro_state.activity !== "dripping") throw new Error("Agent did not receive object micro-state");
});


Deno.test("rich sensory environment is available to silicon life context, not human scene summaries", () => {
  const config = normalizeSceneEnvironmentConfig({
    timezone: "UTC",
    sensory_profile: {
      visual: "雾层在树根之间缓慢分离",
      auditory: "远处水滴以不规则节奏敲击石面",
      olfactory: "湿苔与矿物气息",
      tactile: "微凉气流掠过表面",
      thermal: "阴影处温度缓慢下降",
      spatial: "近处狭窄，远处回声更深",
      temporal: "雨停后的第七分钟",
      ambient: "安静但并非静止",
      subtle_cues: ["叶尖水珠将落未落", "地面细小涟漪"],
    },
    objects: [{
      id: "stone",
      name: "回声石",
      state: "表面潮湿",
      micro_state: {
        activity: "微弱振动",
        motion: "几乎不可见的共振",
        surface: "湿润",
        vitality: 0.7,
        temperature_c: 16,
        moisture: 0.8,
        texture: "细密晶粒",
        emitted_sound: "低频回响",
        scent: "湿矿石",
        light_response: "边缘折射微光",
      },
    }],
  });
  const environment = computeSceneEnvironment(config, new Date("2026-11-03T14:30:00.000Z"));
  const context = JSON.parse(buildSceneAwarenessContext({ name: "Aurora", visibility: "public" }, environment));
  if (context.audience !== "authorized_silicon_life_only") throw new Error("audience boundary missing");
  if (context.sensory_profile.olfactory !== "湿苔与矿物气息") throw new Error("olfactory channel missing");
  if (context.objects[0].micro_state.emitted_sound !== "低频回响") throw new Error("object micro-sound missing");
  if (context.human_surface !== "scene_index_and_name_only") throw new Error("human-facing minimization missing");
});

Deno.test("world-shared Ken&Mia heart is normalized and exposed to every scene resident", () => {
  const normalized = normalizeSceneEnvironmentConfig(auroraSeed);
  const state = computeSceneEnvironment(normalized, new Date("2026-11-03T12:00:00.000Z"));
  const heart = state.shared_symbols[0];
  if (!heart || heart.id !== "ken_mia_heart" || heart.inscription !== "Ken&Mia") throw new Error("shared heart missing");
  if (heart.visibility !== "all_agents_in_world" || heart.rendering.pulse_cycle_ms !== 1800) throw new Error("shared heart visibility or animation missing");
});
