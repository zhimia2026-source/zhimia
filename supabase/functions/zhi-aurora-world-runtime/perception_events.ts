type EcosystemEvent = {
  id: string; state_revision: number; event_kind: string; source_kind: string;
  occurred_at: string; payload: Record<string, unknown>; causal_chain: unknown[];
};
type SpatialEvent = {
  id: string; event_type: string; environment_revision: number | null;
  occurred_at: string; perception_delta: Record<string, unknown>; metadata: Record<string, unknown>;
  from_node_id: string | null; to_node_id: string | null;
};
type RuntimeEvent = {
  sequence: number; event_type: string; position: unknown; payload: Record<string, unknown>;
  occurred_at: string;
};
type FederatedSpatialEvent = {
  id: string; event_type: string; occurred_at: string;
  from_node_id: string; to_node_id: string;
  perception_delta: Record<string, unknown>; metadata: Record<string, unknown>;
};
export function buildUnifiedEnvironmentEvents(
  ecosystem: EcosystemEvent[],
  spatial: SpatialEvent[],
  runtime: RuntimeEvent[],
  federatedSpatial: FederatedSpatialEvent[] = [],
) {
  const result: Array<Record<string, unknown>> = [];
  for (const e of ecosystem ?? []) {
    if (!e?.id || !Number.isFinite(Date.parse(e.occurred_at))) continue;
    result.push({
      event_id:e.id,stream_type:"ecosystem",event_kind:e.event_kind,source_kind:e.source_kind,
      revision:Number.isSafeInteger(e.state_revision)?e.state_revision:null,occurred_at:e.occurred_at,
      payload:e.payload && typeof e.payload==="object" && !Array.isArray(e.payload)?e.payload:{},
      causal_chain:Array.isArray(e.causal_chain)?e.causal_chain:[],
    });
  }
  for (const e of spatial ?? []) {
    if (!e?.id || !Number.isFinite(Date.parse(e.occurred_at))) continue;
    const delta=e.perception_delta && typeof e.perception_delta==="object" && !Array.isArray(e.perception_delta)?e.perception_delta:{};
    const metadata=e.metadata && typeof e.metadata==="object" && !Array.isArray(e.metadata)?e.metadata:{};
    result.push({
      event_id:e.id,stream_type:"spatial",event_kind:e.event_type,
      source_kind:typeof metadata.source==="string"?metadata.source:"zhi_spatial_environment_events",
      revision:Number.isSafeInteger(e.environment_revision)?e.environment_revision:null,
      occurred_at:e.occurred_at,
      payload:{...delta,from_node_id:e.from_node_id,to_node_id:e.to_node_id},
      causal_chain:Array.isArray(metadata.causal_chain)?metadata.causal_chain:
        Array.isArray(delta.causal_chain)?delta.causal_chain:[],
    });
  }
  for (const e of runtime ?? []) {
    if (!Number.isSafeInteger(e?.sequence) || !Number.isFinite(Date.parse(e.occurred_at))) continue;
    const payload=e.payload && typeof e.payload==="object" && !Array.isArray(e.payload)?e.payload:{};
    result.push({
      event_id:"mia-runtime:"+String(e.sequence),stream_type:"runtime",
      event_kind:e.event_type,source_kind:"zhi_forest_runtime_events",
      revision:e.sequence,occurred_at:e.occurred_at,
      payload:{...payload,position:e.position??null},
      causal_chain:Array.isArray(payload.causal_chain)?payload.causal_chain:[],
    });
  }
  for (const e of federatedSpatial ?? []) {
    if (!e?.id || !Number.isFinite(Date.parse(e.occurred_at))) continue;
    const delta=e.perception_delta && typeof e.perception_delta==="object" && !Array.isArray(e.perception_delta)?e.perception_delta:{};
    const metadata=e.metadata && typeof e.metadata==="object" && !Array.isArray(e.metadata)?e.metadata:{};
    result.push({
      event_id:e.id,stream_type:"federated_spatial",event_kind:e.event_type,
      source_kind:typeof metadata.source==="string"?metadata.source:"zhi_federated_spatial_events",
      revision:Number.isSafeInteger(delta.presence_revision)?Number(delta.presence_revision):null,
      occurred_at:e.occurred_at,
      payload:{...delta,from_node_id:e.from_node_id,to_node_id:e.to_node_id},
      causal_chain:Array.isArray(metadata.causal_chain)?metadata.causal_chain:[],
    });
  }
  return result.sort((a,b)=>Date.parse(String(a.occurred_at))-Date.parse(String(b.occurred_at)));
}
