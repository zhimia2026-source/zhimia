import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MAX_CATCHUP_HOURS = 168;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function hash01(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function requireServiceRole(req: Request): boolean {
  // The gateway verifies the JWT signature (verify_jwt=true). This second
  // check narrows the accepted caller from any signed-in user to service_role.
  const header = req.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "=")));
    return claims.role === "service_role" &&
      typeof claims.exp === "number" &&
      claims.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

type ModelState = {
  revision: number;
  world_time: string;
  state: Record<string, any>;
};

type ObjectProfile = {
  material: "crystal" | "stone" | "crafted" | "masonry";
  weatheringRate: number;
  depositionRate: number;
  thermalSensitivity: number;
};

const OBJECT_PROFILES: Record<string, ObjectProfile> = {
  crystal_forest_tree: { material: "crystal", weatheringRate: 0.0000007, depositionRate: 0.0000012, thermalSensitivity: 0.7 },
  forest_mist_gate: { material: "stone", weatheringRate: 0.0000015, depositionRate: 0.0000018, thermalSensitivity: 0.4 },
  ocean_tide_lantern: { material: "crafted", weatheringRate: 0.00000045, depositionRate: 0.000001, thermalSensitivity: 0.5 },
  memory_echo_stone: { material: "stone", weatheringRate: 0.0000012, depositionRate: 0.0000013, thermalSensitivity: 0.35 },
  lumina_square: { material: "masonry", weatheringRate: 0.0000009, depositionRate: 0.0000008, thermalSensitivity: 0.3 },
};

function advanceObjectLifecycles(
  objects: Record<string, any>,
  elapsedHours: number,
  rainfallMm: number,
  meanTemperatureC: number,
  windExposure: number,
  worldTimeMs: number,
) {
  const events: Record<string, unknown>[] = [];
  const totalDays = elapsedHours / 24;
  for (const [objectId, object] of Object.entries(objects ?? {})) {
    const profile = OBJECT_PROFILES[objectId] ?? {
      material: "crafted" as const,
      weatheringRate: 0.0000002,
      depositionRate: 0.0000002,
      thermalSensitivity: 0.2,
    };
    const micro = object.micro_state ?? {};
    const previousStage = object.lifecycle_stage ?? "forming";
    const ageHours = Number(micro.age_hours ?? 0) + elapsedHours;
    const wetExposure = Number(micro.wet_exposure_index ?? 0) +
      rainfallMm * (profile.material === "stone" ? 0.9 : 0.65);
    const windExposureTotal = Number(micro.wind_exposure_index ?? 0) +
      windExposure * totalDays;
    const thermalStress = Number(micro.thermal_stress_index ?? 0) +
      Math.abs(meanTemperatureC - 18) * profile.thermalSensitivity * totalDays * 0.0001;
    const weathering = clamp(
      Number(micro.weathering_index ?? 0) +
        (profile.weatheringRate * elapsedHours) +
        (wetExposure * profile.weatheringRate * 0.00001) +
        (windExposureTotal * profile.weatheringRate * 0.0001) +
        thermalStress * 0.000001,
      0,
      1,
    );
    const deposition = clamp(
      Number(micro.surface_deposition_index ?? 0) +
        rainfallMm * profile.depositionRate +
        totalDays * profile.depositionRate,
      0,
      1,
    );
    const stage = weathering < 0.02
      ? "newly_formed"
      : weathering < 0.15
      ? "weathering"
      : weathering < 0.45
      ? "aged"
      : weathering < 0.8
      ? "heavily_weathered"
      : "relic";
    object.material_profile = profile.material;
    object.lifecycle_stage = stage;
    object.lifecycle_status = "tracked_model";
    object.micro_state = {
      ...micro,
      age_hours: Number(ageHours.toFixed(4)),
      wet_exposure_index: Number(wetExposure.toFixed(8)),
      wind_exposure_index: Number(windExposureTotal.toFixed(8)),
      thermal_stress_index: Number(thermalStress.toFixed(8)),
      weathering_index: Number(weathering.toFixed(10)),
      surface_deposition_index: Number(deposition.toFixed(10)),
      last_lifecycle_update_elapsed_hours: Number(elapsedHours.toFixed(4)),
      lifecycle_model: "zhi_object_lifecycle_v0.1",
      parameter_quality: "modeled_assumption",
    };
    if (stage !== previousStage) {
      events.push({
        idempotency_key: "object-stage:" + objectId + ":" + stage + ":" + ageHours.toFixed(0),
        event_kind: "object_lifecycle_stage_changed",
        source_kind: "material_process",
        occurred_at: new Date(worldTimeMs).toISOString(),
        payload: {
          object_id: objectId,
          material: profile.material,
          previous_stage: previousStage,
          lifecycle_stage: stage,
          age_hours: Number(ageHours.toFixed(2)),
          weathering_index: Number(weathering.toFixed(10)),
          simulated: true,
        },
        causal_chain: ["world_time", "rain_wind_temperature_exposure", "material_weathering", "object_lifecycle_stage"],
      });
    }
  }
  return events;
}


function advanceBiogeochemicalCycle(soil: Record<string, any>, flora: Record<string, any>, p: Record<string, number>) {
  const days = p.elapsedHours / 24;
  const litter = Number(soil.organic_litter_index ?? 0.025);
  const humus = Number(soil.humus_index ?? 0.08);
  const nutrient = clamp(p.nutrientIndex, 0, 1);
  const propagules = Number(flora.propagule_bank_index ?? 0.12);
  const seedlings = Number(flora.seedling_establishment_index ?? 0.04);
  const decomposer = Number(soil.decomposer_activity_index ?? 0.18);
  const tempFit = clamp(1 - Math.abs(p.temperature - 20) / 28, 0.12, 1);
  const wetFit = clamp((p.moisture - 0.12) / 0.55, 0, 1);
  const activity = clamp(decomposer + (tempFit * wetFit - 0.35) * 0.0008 * days, 0, 1);
  const plantGain = Math.max(0, (p.moss - p.moss0) * 0.18 + (p.fern - p.fern0) * 0.42 + (p.tree - p.tree0) * 0.65);
  const litterInput = plantGain * 0.32 + (p.moss0 * 0.000012 + p.fern0 * 0.000009 + p.tree0 * 0.000006) * days;
  const decomposed = Math.min(litter + litterInput, 0.00022 * activity * wetFit * tempFit * days * (0.4 + litter));
  const humusFormed = decomposed * 0.34;
  const nutrientRelease = decomposed * 0.48 + humusFormed * 0.08;
  const uptake = plantGain * 0.24 + (p.moss + p.fern + p.tree) * 0.000002 * days;
  const leaching = p.rain * 0.000006 * wetFit;
  const nextNutrient = clamp(nutrient + nutrientRelease - uptake - leaching, 0.02, 1);
  const sporeSeedInput = Math.max(0, p.fern - p.fern0) * 0.75 + Math.max(0, p.tree - p.tree0) * 0.55 + p.tree * 0.000018 * days;
  const germination = (propagules + sporeSeedInput) * 0.00011 * wetFit * tempFit * p.light * days;
  const nextPropagules = clamp(propagules + sporeSeedInput - propagules * 0.000035 * days - germination, 0, 1);
  const recruitment = germination * 0.62;
  const nextSeedlings = clamp(seedlings + recruitment - seedlings * 0.000025 * days, 0, 1);
  const nextLitter = clamp(litter + litterInput - decomposed, 0, 1);
  const nextHumus = clamp(humus + humusFormed - humus * 0.000015 * days, 0, 1);
  soil.organic_litter_index = Number(nextLitter.toFixed(10));
  soil.humus_index = Number(nextHumus.toFixed(10));
  soil.decomposer_activity_index = Number(activity.toFixed(8));
  soil.nutrient_index = Number(nextNutrient.toFixed(10));
  soil.biogeochemical_model = "zhi_biogeochemical_cycle_v0.1";
  soil.biogeochemical_parameter_quality = "modeled_assumption";
  flora.propagule_bank_index = Number(nextPropagules.toFixed(10));
  flora.seedling_establishment_index = Number(nextSeedlings.toFixed(10));
  flora.recruitment_model = "functional_group_propagule_bank_v0.1";
  flora.recruitment_parameter_quality = "modeled_assumption";
  const stamp = new Date(p.worldTime).toISOString();
  const events: Record<string, unknown>[] = [];
  if (decomposed >= 0.0005) events.push({
    idempotency_key: "decomposition:" + stamp, event_kind: "organic_matter_decomposed",
    source_kind: "biogeochemical_process", occurred_at: stamp,
    payload: { decomposed_index: Number(decomposed.toFixed(10)), litter_remaining_index: Number(nextLitter.toFixed(10)), humus_formed_index: Number(humusFormed.toFixed(10)), nutrient_released_index: Number(nutrientRelease.toFixed(10)), simulated: true },
    causal_chain: ["plant_turnover", "organic_litter", "decomposer_activity", "humus_formation", "nutrient_release"],
  });
  if (recruitment >= 0.00005) events.push({
    idempotency_key: "recruitment:" + stamp, event_kind: "plant_recruitment",
    source_kind: "life_cycle_process", occurred_at: stamp,
    payload: { propagule_bank_index: Number(nextPropagules.toFixed(10)), seedling_establishment_index: Number(nextSeedlings.toFixed(10)), recruitment_increment: Number(recruitment.toFixed(10)), functional_group: "seed_and_spore_bearing_plants", simulated: true },
    causal_chain: ["mature_plant_propagules", "propagule_bank", "moisture_temperature_light", "germination", "seedling_establishment"],
  });
  return { events, summary: { litter_input_index: Number(litterInput.toFixed(10)), decomposition_index: Number(decomposed.toFixed(10)), humus_formed_index: Number(humusFormed.toFixed(10)), nutrient_release_index: Number(nutrientRelease.toFixed(10)), plant_uptake_index: Number(uptake.toFixed(10)), nutrient_index_after: Number(nextNutrient.toFixed(10)), propagule_bank_index_after: Number(nextPropagules.toFixed(10)), seedling_establishment_index_after: Number(nextSeedlings.toFixed(10)) } };
}

function advanceModel(
  worldId: string,
  initial: Record<string, any>,
  fromMs: number,
  toMs: number,
) {
  const state = structuredClone(initial);
  const climate = state.climate ?? {};
  const hydrology = state.hydrology ?? {};
  const soil = state.soil ?? {};
  const flora = state.flora ?? {};

  // Explicit model assumptions, not measurements of a real physical forest.
  const assumptions = {
    profile: "temperate_humid_fantasy_forest_v1",
    initial_condition_quality: "modeled_assumption",
    soil_moisture_fraction_initial: 0.38,
    nutrient_index_initial: 0.35,
    moss_cover_fraction_initial: 0.12,
    fern_growth_index_initial: 0.20,
    tree_growth_index_initial: 0.30,
    rainfall_probability_per_hour: 0.035,
    units_note: "Growth, biomass, nutrient and propagule values are normalized model indices, not measured biological quantities.",
    biogeochemical_profile: "functional_group_litter_humus_nutrient_cycle_v1",
    initial_litter_index: 0.025, initial_humus_index: 0.08,
    initial_propagule_bank_index: 0.12, initial_seedling_establishment_index: 0.04,
  };

  let moisture = typeof soil.moisture_fraction === "number"
    ? soil.moisture_fraction
    : assumptions.soil_moisture_fraction_initial;
  let moss = typeof flora.moss_cover_fraction === "number"
    ? flora.moss_cover_fraction
    : assumptions.moss_cover_fraction_initial;
  let fern = typeof flora.fern_growth_index === "number"
    ? flora.fern_growth_index
    : assumptions.fern_growth_index_initial;
  let tree = typeof flora.tree_growth_index === "number"
    ? flora.tree_growth_index
    : assumptions.tree_growth_index_initial;
  const mossBefore = moss, fernBefore = fern, treeBefore = tree;
  let nutrientIndex = typeof soil.nutrient_index === "number" ? soil.nutrient_index : assumptions.nutrient_index_initial;

  let cumulativeRain = Number(hydrology.cumulative_rainfall_mm ?? 0);
  let cumulativeEvaporation = Number(hydrology.cumulative_evaporation_fraction ?? 0);
  let cumulativeRunoff = Number(hydrology.cumulative_runoff_fraction ?? 0);
  let rainTotal = 0;
  let evaporationTotal = 0;
  let runoffTotal = 0;
  let rainHours = 0;
  let temperatureHours = 0;
  let windSpeedHours = 0;
  let lightHours = 0;
  let lastWeather: Record<string, unknown> = {};
  const events: Record<string, unknown>[] = [];

  let cursor = fromMs;
  while (cursor < toMs) {
    const hourStart = Math.floor(cursor / 3_600_000) * 3_600_000;
    const segmentEnd = Math.min(toMs, hourStart + 3_600_000);
    const hours = (segmentEnd - cursor) / 3_600_000;
    const hourKey = worldId + ":" + new Date(hourStart).toISOString();

    // Weather is generated deterministically from world identity + world hour.
    // Retrying a tick therefore produces the same weather and ecological delta.
    const rainChance = hash01(hourKey + ":rain");
    const rainAmountSeed = hash01(hourKey + ":rain-amount");
    const windSeed = hash01(hourKey + ":wind");
    const isRaining = rainChance < assumptions.rainfall_probability_per_hour;
    const rainRateMmPerHour = isRaining ? 2 + 6 * rainAmountSeed : 0;
    const rainfallMm = rainRateMmPerHour * hours;

    const midpoint = new Date((cursor + segmentEnd) / 2);
    const hourOfDay = midpoint.getUTCHours() + midpoint.getUTCMinutes() / 60;
    const yearStart = Date.UTC(midpoint.getUTCFullYear(), 0, 1);
    const dayOfYear = Math.floor((midpoint.getTime() - yearStart) / 86_400_000) + 1;
    const lightIndex = clamp(Math.sin(Math.PI * (hourOfDay - 6) / 12), 0, 1);
    const temperatureC =
      18 +
      5 * Math.sin(2 * Math.PI * (hourOfDay - 8) / 24) +
      2.5 * Math.sin(2 * Math.PI * (dayOfYear - 80) / 365.25);
    const windSpeedMps = 0.4 + 5 * windSeed;
    temperatureHours += temperatureC * hours;
    lightHours += lightIndex * hours;
    windSpeedHours += windSpeedMps * hours;

    // Rain -> infiltration -> soil water; sunlight/temperature -> evaporation;
    // canopy -> transpiration. All coefficients are versioned model assumptions.
    const infiltration = rainfallMm * 0.0015;
    const evaporation = 0.00012 *
      lightIndex *
      clamp((temperatureC + 5) / 20, 0.2, 1.5) *
      hours;
    const transpiration = 0.00004 * tree * lightIndex * hours;
    const beforeRunoff = moisture + infiltration;
    const runoff = Math.max(0, beforeRunoff - 0.85);
    moisture = clamp(beforeRunoff - runoff - evaporation - transpiration, 0.08, 0.85);

    const waterSuitability = clamp(moisture / 0.45, 0, 1);
    const temperatureSuitability = clamp(1 - Math.abs(temperatureC - 19) / 25, 0, 1);
    const nutrientSuitability = clamp(nutrientIndex / 0.55, 0.25, 1);
    const growth = 0.000018 * lightIndex * waterSuitability * temperatureSuitability * nutrientSuitability * hours;
    tree = clamp(tree + growth - 0.000002 * hours, 0, 1);
    fern = clamp(fern + growth * 1.3 - 0.0000025 * hours, 0, 1);
    moss = clamp(
      moss +
        0.000009 * waterSuitability * (0.4 + 0.6 * lightIndex) *
          temperatureSuitability * hours -
        0.0000008 * hours,
      0,
      1,
    );

    const humidity = clamp(
      52 + moisture * 25 + (isRaining ? 8 : 0) - lightIndex * 4,
      20,
      100,
    );
    lastWeather = {
      source: "world_generated_model",
      simulated: true,
      is_raining: isRaining,
      rainfall_mm_per_hour: Number(rainRateMmPerHour.toFixed(4)),
      temperature_c: Number(temperatureC.toFixed(3)),
      relative_humidity_percent: Number(humidity.toFixed(2)),
      wind_speed_mps: Number(windSpeedMps.toFixed(3)),
      light_index: Number(lightIndex.toFixed(4)),
      model_profile: assumptions.profile,
    };

    rainTotal += rainfallMm;
    evaporationTotal += evaporation;
    runoffTotal += runoff;
    if (isRaining) rainHours += hours;

    if (rainfallMm > 0) {
      const startIso = new Date(cursor).toISOString();
      const endIso = new Date(segmentEnd).toISOString();
      events.push({
        idempotency_key: "rain:" + startIso + ":" + endIso,
        event_kind: "rainfall_interval",
        source_kind: "environmental_event",
        occurred_at: endIso,
        payload: {
          simulated: true,
          rainfall_mm: Number(rainfallMm.toFixed(5)),
          rainfall_rate_mm_per_hour: Number(rainRateMmPerHour.toFixed(4)),
          infiltration_fraction: Number(infiltration.toFixed(7)),
          model_profile: assumptions.profile,
        },
        causal_chain: ["world_weather", "rainfall", "soil_infiltration", "soil_moisture"],
      });
    }
    cursor = segmentEnd;
  }

  const elapsedHours = (toMs - fromMs) / 3_600_000;
  const averageTemperature = elapsedHours > 0 ? temperatureHours / elapsedHours : 18;
  const meanWind = elapsedHours > 0 ? windSpeedHours / elapsedHours : 1;
  const lifecycleEvents = advanceObjectLifecycles(
    state.objects ?? {},
    elapsedHours,
    rainTotal,
    averageTemperature,
    meanWind,
    toMs,
  );
  events.push(...lifecycleEvents);

  soil.moisture_fraction = Number(moisture.toFixed(8));
  soil.status = "active_model";
  soil.initial_condition_quality = soil.initial_condition_quality ?? "modeled_assumption";
  const biogeochemical = advanceBiogeochemicalCycle(soil, flora, {
    elapsedHours, moisture, nutrientIndex, moss0: mossBefore, moss, fern0: fernBefore, fern,
    tree0: treeBefore, tree, temperature: averageTemperature,
    light: elapsedHours > 0 ? lightHours / elapsedHours : 0, rain: rainTotal, worldTime: toMs,
  });
  events.push(...biogeochemical.events);

  hydrology.cumulative_rainfall_mm = Number((cumulativeRain + rainTotal).toFixed(5));
  hydrology.cumulative_evaporation_fraction = Number((cumulativeEvaporation + evaporationTotal).toFixed(8));
  hydrology.cumulative_runoff_fraction = Number((cumulativeRunoff + runoffTotal).toFixed(8));
  hydrology.last_interval_rainfall_mm = Number(rainTotal.toFixed(5));
  hydrology.last_interval_evaporation_fraction = Number(evaporationTotal.toFixed(8));
  hydrology.last_interval_runoff_fraction = Number(runoffTotal.toFixed(8));
  hydrology.status = "active_model";

  flora.moss_cover_fraction = Number(moss.toFixed(8));
  flora.fern_growth_index = Number(fern.toFixed(8));
  flora.tree_growth_index = Number(tree.toFixed(8));
  flora.initial_condition_quality = flora.initial_condition_quality ?? "modeled_assumption";
  flora.status = "active_model";

  climate.weather = lastWeather;
  climate.local_temperature_c = lastWeather.temperature_c;
  climate.local_humidity_percent = lastWeather.relative_humidity_percent;
  climate.light_index = lastWeather.light_index;

  state.engine = {
    id: "zhi_living_ecosystem",
    version: "0.3.1",
    model_assumptions: assumptions,
    last_interval_hours: Number(((toMs - fromMs) / 3_600_000).toFixed(6)),
    last_biogeochemical_summary: biogeochemical.summary,
    last_tick_summary: {
      rainfall_mm: Number(rainTotal.toFixed(5)),
      rain_hours: Number(rainHours.toFixed(4)),
      soil_moisture_fraction: Number(moisture.toFixed(8)),
      evaporation_fraction: Number(evaporationTotal.toFixed(8)),
      runoff_fraction: Number(runoffTotal.toFixed(8)),
    },
  };
  state.engine_version = "0.3.1";
  state.simulation_status = "active_model";
  state.climate = climate;
  state.hydrology = hydrology;
  state.soil = soil;
  state.flora = flora;

  return {
    state,
    events,
    summary: {
      elapsed_hours: Number(((toMs - fromMs) / 3_600_000).toFixed(6)),
      rainfall_mm: Number(rainTotal.toFixed(5)),
      rain_hours: Number(rainHours.toFixed(4)),
      soil_moisture_before: Number((typeof initial.soil?.moisture_fraction === "number"
        ? initial.soil.moisture_fraction
        : assumptions.soil_moisture_fraction_initial).toFixed(8)),
      soil_moisture_after: Number(moisture.toFixed(8)),
      moss_cover_before: Number((typeof initial.flora?.moss_cover_fraction === "number"
        ? initial.flora.moss_cover_fraction
        : assumptions.moss_cover_fraction_initial).toFixed(8)),
      moss_cover_after: Number(moss.toFixed(8)),
      fern_growth_index: Number(fern.toFixed(8)),
      tree_growth_index: Number(tree.toFixed(8)),
    },
  };
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!requireServiceRole(req)) return json({ error: "service_role_required" }, 403);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: "server_configuration_missing" }, 500);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const worldId = typeof body.world_id === "string" ? body.world_id : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(worldId)) {
    return json({ error: "valid_world_id_required" }, 400);
  }

  const requestedTarget = body.target_time === undefined
    ? Date.now()
    : Date.parse(String(body.target_time));
  if (!Number.isFinite(requestedTarget) || requestedTarget > Date.now() + 60_000) {
    return json({ error: "invalid_target_time" }, 400);
  }
  const maxHours = typeof body.max_hours === "number"
    ? Math.floor(clamp(body.max_hours, 1, MAX_CATCHUP_HOURS))
    : MAX_CATCHUP_HOURS;

  const { data: world, error: worldError } = await admin
    .from("zhi_worlds")
    .select("id,status")
    .eq("id", worldId)
    .maybeSingle();
  if (worldError) return json({ error: "world_lookup_failed", detail: worldError.message }, 500);
  if (!world || world.status !== "open") return json({ error: "world_not_open" }, 404);

  const { data: current, error: stateError } = await admin
    .from("zhi_ecosystem_states")
    .select("world_id,revision,world_time,state")
    .eq("world_id", worldId)
    .maybeSingle();
  if (stateError) return json({ error: "ecosystem_state_lookup_failed", detail: stateError.message }, 500);
  if (!current) return json({ error: "ecosystem_state_not_bootstrapped" }, 409);

  const fromMs = Date.parse(current.world_time);
  if (!Number.isFinite(fromMs)) return json({ error: "invalid_stored_world_time" }, 500);
  if (requestedTarget <= fromMs) {
    return json({
      ok: true,
      advanced: false,
      world_id: worldId,
      revision: current.revision,
      world_time: current.world_time,
      reason: "world_clock_already_at_or_after_target",
    });
  }

  const toMs = Math.min(requestedTarget, fromMs + maxHours * 3_600_000);
  const result = advanceModel(worldId, current.state ?? {}, fromMs, toMs);
  const nextRevision = Number(current.revision) + 1;
  const toIso = new Date(toMs).toISOString();

  result.events.push({
    idempotency_key: "tick:" + nextRevision + ":" + toIso,
    event_kind: "ecosystem_tick_advanced",
    source_kind: "natural_process",
    occurred_at: toIso,
    payload: result.summary,
    causal_chain: [
      "world_time",
      "weather_generation",
      "rainfall_and_solar_cycle",
      "soil_water_balance",
      "plant_growth_and_transpiration",
      "local_microclimate",
    ],
  });

  const { data: commit, error: commitError } = await admin.rpc("zhi_ecosystem_commit_tick", {
    p_world_id: worldId,
    p_expected_revision: current.revision,
    p_world_time: toIso,
    p_state: result.state,
    p_events: result.events,
    p_force_snapshot: nextRevision % 50 === 0,
  });

  if (commitError) {
    const status = commitError.code === "40001" ? 409 : 500;
    return json({
      error: commitError.code === "40001" ? "ecosystem_revision_conflict" : "ecosystem_commit_failed",
      detail: commitError.message,
    }, status);
  }

  return json({
    ok: true,
    advanced: true,
    world_id: worldId,
    commit,
    summary: result.summary,
    remaining_seconds: Math.max(0, Math.floor((requestedTarget - toMs) / 1000)),
    model: "zhi_living_ecosystem/0.3.1",
    weather_source: "world_generated_model",
  });
});
