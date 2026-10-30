export type PrivateAgentProfile = {
  display_name?: unknown;
  role?: unknown;
};

function boundedText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized.length > max ? normalized.slice(0, max) + "…[truncated]" : normalized;
}

function boundedJson(value: unknown, max: number): string {
  try {
    const serialized = JSON.stringify(value ?? null);
    return serialized.length > max ? serialized.slice(0, max) + "…[truncated]" : serialized;
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
