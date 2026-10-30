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
  let atmosphereTags = boundedList(state.atmosphere_tags);
  const objects = (Array.isArray(state.objects) ? state.objects : []).slice(0, 100).flatMap((value) => {
    const item = record(value);
    const id = boundedText(item.id, 80);
    const name = boundedText(item.name, 120);
    const objectState = boundedText(item.state, 80);
    if (!id || !name || !objectState) return [];
    return [{ id, name, state: objectState, interaction_options: boundedList(item.interaction_options, 12) }];
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
    const objectStates = record(delta.object_states);
    for (const object of objects) {
      const nextState = boundedText(objectStates[object.id], 80);
      if (nextState) object.state = nextState;
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
    atmosphere_tags: atmosphereTags,
    objects,
    active_events: activeEvents.map((event) => ({
      id: boundedText(event.id, 80),
      type: boundedText(event.type, 80) ?? "environmental",
      label: boundedText(event.label, 120) ?? "环境事件",
    })),
    behavior_weights: behaviorWeights,
  };
  if (new TextEncoder().encode(JSON.stringify(normalized)).length > 32768) throw new Error("environment_config_too_large");
  return normalized;
}


/** Accepts only the public scene-environment contract; private cognition fields are rejected. */
export function normalizeSceneEnvironmentConfig(raw: unknown): JsonRecord {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("invalid_environment_config");
  const input = record(raw);
  const allowed = new Set(["timezone", "lighting", "soundscape", "atmosphere_tags", "objects", "events", "behavior_weights"]);
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
    return { id, name, state, interaction_options: boundedList(item.interaction_options, 12) };
  });
  if (new Set(objects.map((item) => item.id)).size !== objects.length) throw new Error("duplicate_environment_object_id");

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
    const knownObjectIds = new Set(objects.map((object) => object.id));
    const safeObjectStates: Record<string, string> = {};
    for (const [objectId, state] of Object.entries(objectStates)) {
      const safeState = boundedText(state, 80);
      if (knownObjectIds.has(objectId) && safeState) safeObjectStates[objectId] = safeState;
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
    atmosphere_tags: boundedList(input.atmosphere_tags),
    objects,
    events,
    behavior_weights: behaviorWeights,
  };
  if (new TextEncoder().encode(JSON.stringify(normalized)).length > 32768) throw new Error("environment_config_too_large");
  return normalized;
}
