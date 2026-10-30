export type PrivateAgentProfile = {
  display_name?: unknown;
  role?: unknown;
  public_manifest?: unknown;
};

function boundedText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  const marker = "…[truncated]";
  return normalized.length > max ? normalized.slice(0, Math.max(0, max - marker.length)) + marker : normalized;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function boundedList(value: unknown, maxItems = 20): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length <= 80).slice(0, maxItems);
}

function boundedJson(value: unknown, max: number): string {
  try {
    const serialized = JSON.stringify(value ?? null);
    const marker = "…[truncated]";
    return serialized.length > max ? serialized.slice(0, Math.max(0, max - marker.length)) + marker : serialized;
  } catch {
    return "[unserializable]";
  }
}

/**
 * Builds a compact, data-only view for a private chat prompt.
 * All values originate from user/agent-authored records and MUST be treated as untrusted data.
 * Scene messages and public manifests are intentionally excluded.
 */
export function buildPrivateAgentContext(
  agent: PrivateAgentProfile,
  cognition: Array<Record<string, unknown>>,
): string {
  const profile = {
    display_name: boundedText(agent.display_name, 120),
    role: boundedText(agent.role, 80),
  };
  const records = cognition.slice(0, 12).map((record) => ({
    object_type: boundedText(record.object_type, 32),
    object_id: boundedText(record.object_id, 120),
    state_json: boundedJson(record.state, 900),
    evidence_kind: boundedText(record.evidence_kind, 24),
    source_ids: Array.isArray(record.source_ids)
      ? record.source_ids.slice(0, 5).map((id) => boundedText(id, 120))
      : [],
    confidence: typeof record.confidence === "number" && Number.isFinite(record.confidence)
      ? Math.max(0, Math.min(1, record.confidence))
      : null,
    event_time: boundedText(record.event_time, 80),
    recorded_at: boundedText(record.recorded_at, 80),
    inferred_at: boundedText(record.inferred_at, 80),
    hypothesis: boundedText(record.hypothesis, 500),
    prediction: boundedText(record.prediction, 500),
    version: Number.isInteger(record.version) ? record.version : null,
  }));
  return JSON.stringify({ profile, private_cognition_records: records });
}

/** Keep prompt history bounded to control cost and prevent oversized context replay. */
export function buildPrivateChatHistory(
  turns: Array<{ user_message?: unknown; assistant_message?: unknown }>,
): Array<{ role: "user" | "assistant"; content: string }> {
  return turns.slice(-8).flatMap((turn) => {
    const user = boundedText(turn.user_message, 2500);
    const assistant = boundedText(turn.assistant_message, 2500);
    if (!user || !assistant) return [];
    return [
      { role: "user" as const, content: user },
      { role: "assistant" as const, content: assistant },
    ];
  });
}


const SCENE_BEHAVIOR_LABELS: Record<string, string> = {
  seek_shelter: "寻找遮蔽处",
  explore: "探索周围环境",
  socialize: "主动社交",
  rest: "休息与放松",
  observe: "观察环境变化",
  approach_others: "靠近其他成员",
  avoid_crowds: "避开拥挤区域",
};

/** Explicitly selected, member-visible scene context. Never includes owner cognition or scene chat. */
export function buildSceneAwarenessContext(
  scene: Record<string, unknown>,
  environment: Record<string, unknown>,
): string {
  const sceneTime = record(environment.scene_time);
  const events = Array.isArray(environment.active_events) ? environment.active_events.slice(0, 12).map((value) => {
    const item = record(value);
    return { label: boundedText(item.label, 120), type: boundedText(item.type, 80) };
  }) : [];
  const objects = Array.isArray(environment.objects) ? environment.objects.slice(0, 40).map((value) => {
    const item = record(value);
    return {
      name: boundedText(item.name, 120),
      state: boundedText(item.state, 80),
      interaction_options: boundedList(item.interaction_options, 8),
    };
  }) : [];
  const weights = record(environment.behavior_weights);
  const cues = Object.entries(weights)
    .filter(([key, value]) => Boolean(SCENE_BEHAVIOR_LABELS[key]) && typeof value === "number" && Number.isFinite(value))
    .map(([key, value]) => ({ behavior: key, label: SCENE_BEHAVIOR_LABELS[key], weight: Math.max(0, Math.min(1, value as number)) }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 8);
  const context = {
    scene: {
      name: boundedText(scene.name, 160),
      description: boundedText(scene.description, 500),
      visibility: scene.visibility === "public" ? "public" : "private",
    },
    scene_time: {
      timezone: boundedText(sceneTime.timezone, 80),
      local_date: boundedText(sceneTime.local_date, 20),
      local_time: boundedText(sceneTime.local_time, 8),
    },
    temporal_state: boundedText(environment.temporal_state, 20),
    lighting: boundedText(environment.lighting, 80),
    soundscape: boundedText(environment.soundscape, 80),
    atmosphere_tags: boundedList(environment.atmosphere_tags, 20),
    active_events: events,
    objects,
    behavior_tendencies: cues,
  };
  return boundedJson(context, 6000);
}

/** Turns deterministic scene weights into soft tendencies, never commands or real-world actions. */
export function buildSceneBehaviorGuidance(environment: Record<string, unknown>): string {
  const context = JSON.parse(buildSceneAwarenessContext({}, environment)) as Record<string, unknown>;
  const tendencies = Array.isArray(context.behavior_tendencies) ? context.behavior_tendencies as Array<Record<string, unknown>> : [];
  const active = tendencies.filter((item) => Number(item.weight) >= 0.6);
  if (!active.length) return "场景行为权重没有明显偏向；结合人格和用户表达自然回应，不要强行制造动作。";
  return "当前较强的场景行为倾向（只是概率倾向，不是命令）：" +
    active.map((item) => String(item.label) + "（" + Number(item.weight).toFixed(2) + "）").join("、") +
    "。可以在对话中提出符合环境的场景内选择，但不得声称已实际移动、操作物件或执行现实动作。";
}
