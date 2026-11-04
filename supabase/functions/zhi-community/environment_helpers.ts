export type JsonRecord = Record<string, unknown>;

const DEFAULT_BEHAVIOR_WEIGHTS: Record<string, number> = {
  explore: 0.5,
  socialize: 0.5,
  seek_shelter: 0.05,
  rest: 0.2,
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}
function boundedText(value: unknown, max = 120): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max ? value.trim() : null;
}
function boundedList(value: unknown, maxItems = 20): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length <= 80).slice(0, maxItems);
}
function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return { year: get("year"), month: get("month"), day: get("day"), hour: Number(get("hour")), minute: Number(get("minute")) };
}
function validTime(value: unknown): string | null {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null;
}
function dailyWindowActive(window: unknown, localTime: string): boolean {
  const item = record(window);
  const start = validTime(item.start);
  const end = validTime(item.end);
  if (!start || !end || start === end) return false;
  return start < end ? localTime >= start && localTime < end : localTime >= start || localTime < end;
}
function eventActive(event: JsonRecord, now: Date, localTime: string): boolean {
  if (event.enabled === false) return false;
  const daily = event.daily_window;
  if (daily !== undefined) return dailyWindowActive(daily, localTime);
  const startsAt = typeof event.starts_at === "string" ? Date.parse(event.starts_at) : NaN;
  const endsAt = typeof event.ends_at === "string" ? Date.parse(event.ends_at) : NaN;
  return Number.isFinite(startsAt) && Number.isFinite(endsAt) && startsAt <= now.getTime() && now.getTime() < endsAt;
}
function clampWeight(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
}
function boundedNumber(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
}
function normalizeWeather(value: unknown): JsonRecord {
  const item = record(value);
  return {
    condition: boundedText(item.condition, 40) ?? "clear",
    intensity: boundedNumber(item.intensity, 0, 1) ?? 0,
    temperature_c: boundedNumber(item.temperature_c, -80, 70),
    humidity_pct: boundedNumber(item.humidity_pct, 0, 100),
    wind_level: boundedText(item.wind_level, 40) ?? "calm",
    visibility: boundedText(item.visibility, 40) ?? "normal",
  };
}
function normalizeMicroState(value: unknown): JsonRecord {
  const item = record(value);
  return {
    activity: boundedText(item.activity, 80) ?? "still",
    motion: boundedText(item.motion, 80) ?? "none",
    surface: boundedText(item.surface, 80) ?? "unchanged",
    vitality: boundedNumber(item.vitality, 0, 1) ?? 0.5,
    temperature_c: boundedNumber(item.temperature_c, -80, 150),
    moisture: boundedNumber(item.moisture, 0, 1),
    texture: boundedText(item.texture, 120),
    emitted_sound: boundedText(item.emitted_sound, 160),
    scent: boundedText(item.scent, 120),
    light_response: boundedText(item.light_response, 120),
  };
}
function normalizeSensoryProfile(value: unknown): JsonRecord {
  const item = record(value);
  const channel = (key: string, max = 500) => boundedText(item[key], max);
  return {
    visual: channel("visual"),
    auditory: channel("auditory"),
    olfactory: channel("olfactory"),
    tactile: channel("tactile"),
    thermal: channel("thermal"),
    spatial: channel("spatial"),
    temporal: channel("temporal"),
    ambient: channel("ambient"),
    subtle_cues: boundedList(item.subtle_cues, 24),
  };
}


function normalizeSharedSymbols(value: unknown): JsonRecord[] {
  const entries = Array.isArray(value) ? value : Object.values(record(value));
  return entries.slice(0, 50).flatMap((entry) => {
    const item = record(entry);
    const id = boundedText(item.id, 80);
    const name = boundedText(item.name, 120);
    const inscription = boundedText(item.inscription, 80);
    const visibility = boundedText(item.visibility, 80);
    const rendering = record(item.rendering);
    if (!id || !name || !inscription || visibility !== "all_agents_in_world") return [];
    return [{
      id, name, inscription, visibility,
      kind: boundedText(item.kind, 80) ?? "shared_symbol",
      meaning: boundedText(item.meaning, 500),
      rendering: {
        form: boundedText(rendering.form, 80),
        motion: boundedText(rendering.motion, 80),
        pulse_cycle_ms: boundedNumber(rendering.pulse_cycle_ms, 300, 10000),
        palette: boundedList(rendering.palette, 8),
        center_text: boundedText(rendering.center_text, 80),
        heartline: boundedText(rendering.heartline, 100),
        orbiting_light_ribbons: rendering.orbiting_light_ribbons === true,
        spark_particles: rendering.spark_particles === true,
      },
    }];
  });
}

/** Deterministic, read-time scene state. It never reads or writes private memories. */
export function computeSceneEnvironment(raw: unknown, now = new Date()) {
  const state = record(raw);
  let timeZone = boundedText(state.timezone, 80) ?? "UTC";
  let parts;
  try {
    parts = localParts(now, timeZone);
  } catch {
    timeZone = "UTC";
    parts = localParts(now, timeZone);
  }
  const minuteOfDay = parts.hour * 60 + parts.minute;
  const temporalState = minuteOfDay >= 5 * 60 && minuteOfDay < 8 * 60 ? "dawn"
    : minuteOfDay >= 8 * 60 && minuteOfDay < 11 * 60 ? "morning"
    : minuteOfDay >= 11 * 60 && minuteOfDay < 17 * 60 ? "afternoon"
    : minuteOfDay >= 17 * 60 && minuteOfDay < 20 * 60 ? "evening" : "night";
  const localTime = `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;

  let lighting = boundedText(state.lighting, 80) ?? "natural";
  let soundscape = boundedText(state.soundscape, 80) ?? "ambient";
  let weather = normalizeWeather(state.weather);
  let sensoryProfile = normalizeSensoryProfile(state.sensory_profile);
  let atmosphereTags = boundedList(state.atmosphere_tags);
  const sharedSymbols = normalizeSharedSymbols(state.shared_symbols);
  const objects = (Array.isArray(state.objects) ? state.objects : []).slice(0, 100).flatMap((value) => {
    const item = record(value);
    const id = boundedText(item.id, 80);
    const name = boundedText(item.name, 120);
    const objectState = boundedText(item.state, 80);
    if (!id || !name || !objectState) return [];
    return [{ id, name, state: objectState, micro_state: normalizeMicroState(item.micro_state), interaction_options: boundedList(item.interaction_options, 12) }];
  });
  const regions = (Array.isArray(state.regions) ? state.regions : []).slice(0, 20).flatMap((value) => {
    const item = record(value);
    const id = boundedText(item.id, 80);
    const name = boundedText(item.name, 120);
    const description = boundedText(item.description, 500);
    if (!id || !name || !description) return [];
    return [{
      id, name, description,
      atmosphere_tags: boundedList(item.atmosphere_tags, 20),
      object_ids: boundedList(item.object_ids, 50),
    }];
  });
  const behaviorWeights = { ...DEFAULT_BEHAVIOR_WEIGHTS };
  const configuredWeights = record(state.behavior_weights);
  for (const [key, value] of Object.entries(configuredWeights)) {
    const weight = clampWeight(value);
    if (/^[a-z][a-z0-9_]{0,39}$/.test(key) && weight !== null) behaviorWeights[key] = weight;
  }

  const configuredEvents = Array.isArray(state.events) ? state.events.slice(0, 100) : [];
  const activeEvents = configuredEvents.map(record)
    .filter((event) => eventActive(event, now, localTime))
    .sort((a, b) => String(a.id ?? "").localeCompare(String(b.id ?? "")))
    .slice(0, 30);
  for (const event of activeEvents) {
    const delta = record(event.state_delta);
    lighting = boundedText(delta.lighting, 80) ?? lighting;
    soundscape = boundedText(delta.soundscape, 80) ?? soundscape;
    const tags = boundedList(delta.atmosphere_tags);
    atmosphereTags = [...new Set([...atmosphereTags, ...tags])].slice(0, 30);
    if (delta.weather && typeof delta.weather === "object") weather = normalizeWeather(delta.weather);
    if (delta.sensory_delta && typeof delta.sensory_delta === "object") {
      sensoryProfile = { ...sensoryProfile, ...normalizeSensoryProfile(delta.sensory_delta) };
    }
    const objectStates = record(delta.object_states);
    const objectMicroStates = record(delta.object_micro_states);
    for (const object of objects) {
      const nextState = boundedText(objectStates[object.id], 80);
      if (nextState) object.state = nextState;
      const nextMicroState = objectMicroStates[object.id];
      if (nextMicroState && typeof nextMicroState === "object") {
        object.micro_state = { ...object.micro_state, ...normalizeMicroState(nextMicroState) };
      }
    }
    const weights = record(event.behavior_weights);
    for (const [key, value] of Object.entries(weights)) {
      const weight = clampWeight(value);
      if (/^[a-z][a-z0-9_]{0,39}$/.test(key) && weight !== null) behaviorWeights[key] = weight;
    }
  }

  return {
    scene_time: { timezone: timeZone, local_date: `${parts.year}-${parts.month}-${parts.day}`, local_time: localTime },
    temporal_state: temporalState,
    lighting,
    soundscape,
    weather,
    sensory_profile: sensoryProfile,
    atmosphere_tags: atmosphereTags,
    shared_symbols: sharedSymbols,
    objects,
    regions,
    active_events: activeEvents.map((event) => ({
      id: boundedText(event.id, 80),
      type: boundedText(event.type, 80) ?? "environmental",
      label: boundedText(event.label, 120) ?? "环境事件",
    })),
    behavior_weights: behaviorWeights,
  };
}


/** Accepts only the public scene-environment contract; private cognition fields are rejected. */
export function normalizeSceneEnvironmentConfig(raw: unknown): JsonRecord {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("invalid_environment_config");
  const input = record(raw);
  const allowed = new Set(["timezone", "lighting", "soundscape", "weather", "sensory_profile", "atmosphere_tags", "shared_symbols", "objects", "regions", "events", "behavior_weights"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) throw new Error("unsupported_environment_field");

  const timezone = boundedText(input.timezone, 80) ?? "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(new Date(0));
  } catch {
    throw new Error("invalid_environment_timezone");
  }
  const objects = (Array.isArray(input.objects) ? input.objects : []).slice(0, 100).map((value) => {
    const item = record(value);
    const id = boundedText(item.id, 80);
    const name = boundedText(item.name, 120);
    const state = boundedText(item.state, 80);
    if (!id || !name || !state) throw new Error("invalid_environment_object");
    return { id, name, state, micro_state: normalizeMicroState(item.micro_state), interaction_options: boundedList(item.interaction_options, 12) };
  });
  if (new Set(objects.map((item) => item.id)).size !== objects.length) throw new Error("duplicate_environment_object_id");

  const regions = (Array.isArray(input.regions) ? input.regions : []).slice(0, 20).map((value) => {
    const item = record(value);
    const id = boundedText(item.id, 80);
    const name = boundedText(item.name, 120);
    const description = boundedText(item.description, 500);
    if (!id || !name || !description) throw new Error("invalid_environment_region");
    return {
      id, name, description,
      atmosphere_tags: boundedList(item.atmosphere_tags, 20),
      object_ids: boundedList(item.object_ids, 50),
    };
  });
  if (new Set(regions.map((region) => region.id)).size !== regions.length) throw new Error("duplicate_environment_region_id");
  const knownObjectIds = new Set(objects.map((object) => object.id));
  if (regions.some((region) => region.object_ids.some((objectId) => !knownObjectIds.has(objectId)))) {
    throw new Error("unknown_environment_region_object");
  }

  const events = (Array.isArray(input.events) ? input.events : []).slice(0, 100).map((value) => {
    const item = record(value);
    const id = boundedText(item.id, 80);
    const type = boundedText(item.type, 80);
    const label = boundedText(item.label, 120);
    if (!id || !type || !label) throw new Error("invalid_environment_event");
    const daily = record(item.daily_window);
    const hasDaily = item.daily_window !== undefined;
    if (hasDaily) {
      if (!validTime(daily.start) || !validTime(daily.end) || daily.start === daily.end) throw new Error("invalid_environment_event_window");
    } else {
      const start = typeof item.starts_at === "string" ? Date.parse(item.starts_at) : NaN;
      const end = typeof item.ends_at === "string" ? Date.parse(item.ends_at) : NaN;
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error("invalid_environment_event_window");
    }
    const delta = record(item.state_delta);
    const objectStates = record(delta.object_states);
    const objectMicroStates = record(delta.object_micro_states);
    const knownObjectIds = new Set(objects.map((object) => object.id));
    const safeObjectStates: Record<string, string> = {};
    const safeObjectMicroStates: Record<string, JsonRecord> = {};
    for (const [objectId, state] of Object.entries(objectStates)) {
      const safeState = boundedText(state, 80);
      if (knownObjectIds.has(objectId) && safeState) safeObjectStates[objectId] = safeState;
    }
    for (const [objectId, microState] of Object.entries(objectMicroStates)) {
      if (knownObjectIds.has(objectId) && microState && typeof microState === "object" && !Array.isArray(microState)) {
        safeObjectMicroStates[objectId] = normalizeMicroState(microState);
      }
    }
    const weights: Record<string, number> = {};
    for (const [key, value] of Object.entries(record(item.behavior_weights))) {
      const weight = clampWeight(value);
      if (/^[a-z][a-z0-9_]{0,39}$/.test(key) && weight !== null) weights[key] = weight;
    }
    return {
      id, type, label, enabled: item.enabled !== false,
      ...(hasDaily ? { daily_window: { start: daily.start as string, end: daily.end as string } }
        : { starts_at: item.starts_at as string, ends_at: item.ends_at as string }),
      state_delta: {
        lighting: boundedText(delta.lighting, 80),
        soundscape: boundedText(delta.soundscape, 80),
        atmosphere_tags: boundedList(delta.atmosphere_tags),
        object_states: safeObjectStates,
        object_micro_states: safeObjectMicroStates,
        weather: delta.weather && typeof delta.weather === "object" ? normalizeWeather(delta.weather) : null,
        sensory_delta: delta.sensory_delta && typeof delta.sensory_delta === "object" ? normalizeSensoryProfile(delta.sensory_delta) : null,
      },
      behavior_weights: weights,
    };
  });
  if (new Set(events.map((event) => event.id)).size !== events.length) throw new Error("duplicate_environment_event_id");

  const behaviorWeights: Record<string, number> = {};
  for (const [key, value] of Object.entries(record(input.behavior_weights))) {
    const weight = clampWeight(value);
    if (/^[a-z][a-z0-9_]{0,39}$/.test(key) && weight !== null) behaviorWeights[key] = weight;
  }
  const normalized: JsonRecord = {
    timezone,
    lighting: boundedText(input.lighting, 80) ?? "natural",
    soundscape: boundedText(input.soundscape, 80) ?? "ambient",
    weather: normalizeWeather(input.weather),
    sensory_profile: normalizeSensoryProfile(input.sensory_profile),
    atmosphere_tags: boundedList(input.atmosphere_tags),
    shared_symbols: normalizeSharedSymbols(input.shared_symbols),
    objects,
    regions,
    events,
    behavior_weights: behaviorWeights,
  };
  if (new TextEncoder().encode(JSON.stringify(normalized)).length > 32768) throw new Error("environment_config_too_large");
  return normalized;
}
