export type EcosystemEventRow = {
  id: string;
  state_revision: number;
  event_kind: string;
  source_kind: string;
  occurred_at: string;
  payload: Record<string, unknown>;
  causal_chain: unknown[];
};

export type SpatialEventRow = {
  id: string;
  event_type: string;
  environment_revision: number | null;
  occurred_at: string;
  perception_delta: Record<string, unknown>;
  metadata: Record<string, unknown>;
  from_node_id: string | null;
  to_node_id: string | null;
  affected_object_ids: unknown[];
};

export type UnifiedEnvironmentEvent = {
  event_id: string;
  stream_type: "ecosystem" | "spatial";
  event_kind: string;
  source_kind: string;
  revision: number | null;
  occurred_at: string;
  payload: Record<string, unknown>;
  causal_chain: unknown[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Merge persisted world ecosystem events and this agent's own spatial events.
 * Spatial event rows are owner/agent scoped by the caller; never pass another
 * resident's private movement events into this packet.
 */
export function buildUnifiedEnvironmentEvents(
  ecosystemEvents: EcosystemEventRow[],
  spatialEvents: SpatialEventRow[],
): UnifiedEnvironmentEvent[] {
  const events: UnifiedEnvironmentEvent[] = [];
  for (const item of ecosystemEvents ?? []) {
    if (!item || typeof item.id !== "string" || !item.id || !Number.isFinite(Date.parse(item.occurred_at))) continue;
    events.push({
      event_id: item.id,
      stream_type: "ecosystem",
      event_kind: item.event_kind || "unknown",
      source_kind: item.source_kind || "unknown",
      revision: Number.isSafeInteger(item.state_revision) ? item.state_revision : null,
      occurred_at: item.occurred_at,
      payload: isObject(item.payload) ? item.payload : {},
      causal_chain: Array.isArray(item.causal_chain) ? item.causal_chain : [],
    });
  }
  for (const item of spatialEvents ?? []) {
    if (!item || typeof item.id !== "string" || !item.id || !Number.isFinite(Date.parse(item.occurred_at))) continue;
    const delta = isObject(item.perception_delta) ? item.perception_delta : {};
    const metadata = isObject(item.metadata) ? item.metadata : {};
    const chain = Array.isArray(metadata.causal_chain) ? metadata.causal_chain
      : Array.isArray(delta.causal_chain) ? delta.causal_chain : [];
    events.push({
      event_id: item.id,
      stream_type: "spatial",
      event_kind: item.event_type || "unknown",
      source_kind: typeof metadata.source === "string" ? metadata.source : "zhi_spatial_environment_events",
      revision: Number.isSafeInteger(item.environment_revision) ? item.environment_revision : null,
      occurred_at: item.occurred_at,
      payload: {
        ...delta,
        from_node_id: item.from_node_id,
        to_node_id: item.to_node_id,
        affected_object_ids: Array.isArray(item.affected_object_ids) ? item.affected_object_ids : [],
      },
      causal_chain: chain,
    });
  }
  return events.sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
}
