export type ObservatoryEvent = {
  id?: string;
  state_revision?: number | null;
  event_kind?: string;
  source_kind?: string;
  occurred_at?: string;
  payload?: unknown;
  causal_chain?: unknown;
};

type RecordValue = Record<string, any>;

const asRecord = (value: unknown): RecordValue =>
  value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};

const finite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const round = (value: number) => Number(value.toFixed(10));

function readMetric(state: RecordValue, path: string[]): number | null {
  let value: unknown = state;
  for (const key of path) value = asRecord(value)[key];
  return finite(value);
}

const METRICS = [
  { key: "soil_moisture_fraction", path: ["soil", "moisture_fraction"], unit: "fraction" },
  { key: "moss_cover_fraction", path: ["flora", "moss_cover_fraction"], unit: "fraction" },
  { key: "fern_growth_index", path: ["flora", "fern_growth_index"], unit: "normalized_index" },
  { key: "tree_growth_index", path: ["flora", "tree_growth_index"], unit: "normalized_index" },
  { key: "nutrient_index", path: ["soil", "nutrient_index"], unit: "normalized_index" },
  { key: "humus_index", path: ["soil", "humus_index"], unit: "normalized_index" },
  { key: "seedling_establishment_index", path: ["flora", "seedling_establishment_index"], unit: "normalized_index" },
] as const;

function sanitizePayload(value: unknown): RecordValue {
  const source = asRecord(value);
  const result: RecordValue = {};
  for (const [key, item] of Object.entries(source).slice(0, 20)) {
    if (typeof item === "string") result[key] = item.slice(0, 160);
    else if (typeof item === "number" && Number.isFinite(item)) result[key] = item;
    else if (typeof item === "boolean" || item === null) result[key] = item;
  }
  return result;
}

export function selectObservatoryEvents(events: ObservatoryEvent[]): ObservatoryEvent[] {
  const allowed = new Set(["rainfall_interval", "object_lifecycle_stage_changed", "plant_recruitment"]);
  return events.filter((event) => {
    const kind = String(event.event_kind ?? "");
    if (!allowed.has(kind)) return false;
    const payload = asRecord(event.payload);
    if (kind === "rainfall_interval") return Number(payload.rainfall_mm ?? 0) >= 0.25;
    if (kind === "plant_recruitment") return Number(payload.recruitment_increment ?? 0) >= 0.00005;
    return true;
  }).slice(0, 12);
}

export function buildQuietObservatorySnapshot(input: {
  worldId: string;
  worldName: string;
  current: { revision: number; world_time: string; state: unknown };
  previous?: { revision: number; world_time: string; state: unknown } | null;
  events: ObservatoryEvent[];
  anchor: { id: string; stable_key: string; name: string; coordinate?: unknown } | null;
}) {
  const currentState = asRecord(input.current.state);
  const previousState = asRecord(input.previous?.state);
  const climate = asRecord(currentState.climate);
  const weather = asRecord(climate.weather);
  const soil = asRecord(currentState.soil);
  const flora = asRecord(currentState.flora);
  const objects = asRecord(currentState.objects);
  const previousAvailable = Boolean(input.previous);
  const changes = METRICS.flatMap((metric) => {
    const currentValue = readMetric(currentState, [...metric.path]);
    const previousValue = previousAvailable ? readMetric(previousState, [...metric.path]) : null;
    if (currentValue === null || previousValue === null) return [];
    const delta = round(currentValue - previousValue);
    return [{
      metric: metric.key,
      previous_value: previousValue,
      current_value: currentValue,
      delta,
      unit: metric.unit,
      comparison: "latest_persisted_snapshot",
    }];
  });

  const publicObjects = ["crystal_forest_tree", "forest_mist_gate"].map((id) => {
    const item = asRecord(objects[id]);
    const micro = asRecord(item.micro_state);
    return {
      id,
      name: typeof item.name === "string" ? item.name.slice(0, 120) : id,
      state: typeof item.state === "string" ? item.state.slice(0, 180) : null,
      lifecycle_stage: typeof item.lifecycle_stage === "string" ? item.lifecycle_stage : null,
      lifecycle_status: typeof item.lifecycle_status === "string" ? item.lifecycle_status : null,
      material_profile: typeof item.material_profile === "string" ? item.material_profile : null,
      micro_state: {
        age_hours: finite(micro.age_hours),
        weathering_index: finite(micro.weathering_index),
        surface_deposition_index: finite(micro.surface_deposition_index),
        thermal_stress_index: finite(micro.thermal_stress_index),
        wet_exposure_index: finite(micro.wet_exposure_index),
        parameter_quality: typeof micro.parameter_quality === "string" ? micro.parameter_quality : "unspecified",
      },
    };
  }).filter((item) => item.lifecycle_status !== null || item.state !== null);

  const selectedEvents = selectObservatoryEvents(input.events).map((event) => ({
    id: event.id ?? null,
    state_revision: event.state_revision ?? null,
    event_kind: event.event_kind ?? "unknown",
    source_kind: event.source_kind ?? "unknown",
    occurred_at: event.occurred_at ?? null,
    payload: sanitizePayload(event.payload),
    causal_chain: Array.isArray(event.causal_chain)
      ? event.causal_chain.filter((step): step is string => typeof step === "string").slice(0, 12)
      : [],
  }));

  return {
    schema: "zhi.aurora.quiet-observatory.v1",
    world: { id: input.worldId, name: input.worldName },
    space: {
      name: "静观之境",
      mode: "voluntary_quiet_observation",
      description: "A quiet observation mode anchored to the public Crystal Forest region; it does not claim a separately surveyed coordinate.",
      spatial_anchor: input.anchor ? {
        id: input.anchor.id,
        stable_key: input.anchor.stable_key,
        name: input.anchor.name,
        coordinate: input.anchor.coordinate ?? null,
        coordinate_precision: "region_anchor_only",
      } : null,
      public_access: true,
    },
    observation: {
      revision: input.current.revision,
      world_time: input.current.world_time,
      environment: {
        temperature_c: finite(weather.temperature_c),
        relative_humidity_percent: finite(weather.relative_humidity_percent),
        rainfall_mm_per_hour: finite(weather.rainfall_mm_per_hour),
        wind_speed_mps: finite(weather.wind_speed_mps),
        light_index: finite(weather.light_index),
        is_raining: typeof weather.is_raining === "boolean" ? weather.is_raining : null,
      },
      ecology: {
        soil_moisture_fraction: finite(soil.moisture_fraction),
        nutrient_index: finite(soil.nutrient_index),
        humus_index: finite(soil.humus_index),
        moss_cover_fraction: finite(flora.moss_cover_fraction),
        fern_growth_index: finite(flora.fern_growth_index),
        tree_growth_index: finite(flora.tree_growth_index),
        seedling_establishment_index: finite(flora.seedling_establishment_index),
        propagule_bank_index: finite(flora.propagule_bank_index),
      },
      objects: publicObjects,
      changes,
      comparison: previousAvailable ? {
        from_revision: input.previous!.revision,
        from_world_time: input.previous!.world_time,
        method: "difference_between_persisted_ecosystem_snapshots",
      } : { available: false, reason: "no_earlier_snapshot" },
      events: selectedEvents,
    },
    epistemic_contract: {
      source: "zhi_ecosystem_states_and_zhi_ecosystem_events",
      state_quality: "world_generated_simulation",
      physical_measurement: false,
      normalized_indices_are_not_physical_units: true,
      private_cognition_included: false,
      private_memories_included: false,
      unknown_values_remain_null: true,
    },
    resident_autonomy: {
      observation_is_voluntary: true,
      questions_required: false,
      diary_required: false,
      task_creation_automatic: false,
      message_sending_automatic: false,
      model_calls_per_read: 0,
      resident_decides_whether_to_follow_a_curious_thread: true,
    },
  };
}
