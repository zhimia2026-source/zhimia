export type AffectMeasurement = { value: number; confidence: number; evidence_kind: "inferred" | "self_report" };
export type AffectAppraisal = {
 dimensions: Record<string, Record<string, AffectMeasurement>>;
 emotion_labels: Array<{label:string;intensity:number;confidence:number;evidence_kind:"inferred"}>;
 evidence_basis: Array<"dialogue_event" | "verified_memory" | "verified_social_interaction" | "verified_action_outcome">;
 confidence:number; rationale:string;
};
const RANGES:Record<string,Record<string,[number,number]>>={
 core_axes:{valence:[-1,1],arousal:[0,1],agency:[-1,1]},
 relational:{trust:[0,1],closeness:[0,1],belonging:[0,1],attachment:[0,1],distance:[0,1],safety_with_other:[0,1]},
 self:{self_worth:[0,1],self_efficacy:[0,1],vulnerability:[0,1],autonomy:[0,1],integrity:[0,1]},
 cognitive:{curiosity:[0,1],surprise:[0,1],confusion:[0,1],certainty:[0,1],meaning:[0,1],anticipation:[0,1]},
 motivational:{approach:[0,1],avoidance:[0,1],exploration:[0,1],expression:[0,1],repair:[0,1],persistence:[0,1],pause:[0,1]},
 regulation:{recovery:[0,1],stability:[0,1],emotional_load:[0,1],change_rate:[0,1]},
 embodied_context:{comfort:[0,1],discomfort:[0,1],sensory_load:[0,1],environment_resonance:[0,1]},
 seven_emotions:{joy:[0,1],anger:[0,1],worry:[0,1],pensiveness:[0,1],grief:[0,1],fear:[0,1],surprise:[0,1]},
 six_desires:{visual_form:[0,1],sound:[0,1],smell:[0,1],taste:[0,1],touch:[0,1],mental_phenomena:[0,1]}
};
const rec=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};

const MOTIVATION_RANGES:Record<string,Record<string,[number,number]>>={
 core_axes:{valence:[-1,1],arousal:[0,1],agency:[-1,1]},
 relational:{trust:[0,1],closeness:[0,1],belonging:[0,1],distance:[0,1],safety_with_other:[0,1]},
 motivational:{approach:[0,1],avoidance:[0,1],exploration:[0,1],expression:[0,1],repair:[0,1],persistence:[0,1],pause:[0,1]},
 regulation:{recovery:[0,1],stability:[0,1],emotional_load:[0,1],change_rate:[0,1]},
 seven_emotions:{joy:[0,1],anger:[0,1],worry:[0,1],pensiveness:[0,1],grief:[0,1],fear:[0,1],surprise:[0,1]},
 six_desires:{visual_form:[0,1],sound:[0,1],smell:[0,1],taste:[0,1],touch:[0,1],mental_phenomena:[0,1]}
};

/** Projects only the current resident's confidence-qualified internal signals for private deliberation. */
export function buildResidentMotivationContext(state:unknown):Record<string,unknown>|null{
 const dimensions=rec(rec(state).dimensions);
 const projected:Record<string,Record<string,{value:number;confidence:number;evidence_kind:"inferred"|"self_report"}>>={};
 for(const [group,allowed] of Object.entries(MOTIVATION_RANGES)){
  const source=rec(dimensions[group]);
  const values:Record<string,{value:number;confidence:number;evidence_kind:"inferred"|"self_report"}>={};
  for(const [key,range] of Object.entries(allowed)){
   const item=rec(source[key]);
   const value=item.value,confidence=item.confidence,evidenceKind=item.evidence_kind;
   if(typeof value!=="number"||!Number.isFinite(value)||value<range[0]||value>range[1]||
      typeof confidence!=="number"||!Number.isFinite(confidence)||confidence<0.55||confidence>1||
      !(evidenceKind==="inferred"||evidenceKind==="self_report")) continue;
   values[key]={value:Number(value.toFixed(4)),confidence:Number(confidence.toFixed(4)),evidence_kind:evidenceKind};
  }
  if(Object.keys(values).length)projected[group]=values;
 }
 if(!Object.keys(projected).length)return null;
 return {schema_version:"aurora.motivation_context.v1",confidence_threshold:0.55,dimensions:projected};
}
function parse(raw:unknown):Record<string,unknown>|null{
 if(raw&&typeof raw==="object"&&!Array.isArray(raw))return raw as Record<string,unknown>;
 if(typeof raw!=="string")return null;
 const s=raw.trim().replace(/^\x60{3}(?:json)?\s*/i,"").replace(/\s*\x60{3}$/i,"");
 try{const v=JSON.parse(s);return v&&typeof v==="object"&&!Array.isArray(v)?v:null;}catch{}
 const start=s.indexOf("{");if(start<0)return null;let depth=0,q=false,e=false;
 for(let i=start;i<s.length;i++){const c=s[i];if(q){if(e)e=false;else if(c==="\\")e=true;else if(c==='"')q=false;continue;}
 if(c==='"')q=true;else if(c==="{")depth++;else if(c==="}"&&--depth===0){try{return rec(JSON.parse(s.slice(start,i+1)));}catch{return null;}}}
 return null;
}
export function normalizeAffectAppraisal(raw:unknown):AffectAppraisal|null{
 const root=parse(raw);if(!root)return null;const a=rec(root.affect_appraisal),dims=rec(a.dimensions),out:AffectAppraisal["dimensions"]={};
 const allowedBasis=new Set(["dialogue_event","verified_memory","verified_social_interaction","verified_action_outcome"]);
 const evidenceBasis=Array.isArray(a.evidence_basis)
  ? [...new Set(a.evidence_basis.filter((v):v is "dialogue_event"|"verified_memory"|"verified_social_interaction"|"verified_action_outcome"=>typeof v==="string"&&allowedBasis.has(v)))]
  : [];
 if(!evidenceBasis.length || (Array.isArray(a.evidence_basis)&&evidenceBasis.length!==a.evidence_basis.length))return null;
 for(const [g,rv] of Object.entries(dims)){const allowed=RANGES[g],vals=rec(rv);if(!allowed||Object.keys(vals).length>12)return null;
 const clean:Record<string,AffectMeasurement>={};for(const [k,rm] of Object.entries(vals)){const m=rec(rm),range=allowed[k];
 if(!range||typeof m.value!=="number"||!Number.isFinite(m.value)||m.value<range[0]||m.value>range[1]||
 typeof m.confidence!=="number"||m.confidence<0||m.confidence>1||!(m.evidence_kind==="inferred"||m.evidence_kind==="self_report"))return null;
 if(m.confidence<=0)continue;
 clean[k]={value:m.value,confidence:m.confidence,evidence_kind:m.evidence_kind};}if(Object.keys(clean).length)out[g]=clean;}
 const labelsRaw=Array.isArray(a.emotion_labels)?a.emotion_labels:[];if(labelsRaw.length>12)return null;
 const labels:AffectAppraisal["emotion_labels"]=[];for(const item of labelsRaw){const x=rec(item);
 if(typeof x.label!=="string"||!x.label.trim()||x.label.length>48||typeof x.intensity!=="number"||x.intensity<0||x.intensity>1||
 typeof x.confidence!=="number"||x.confidence<0||x.confidence>1)return null;
 if(x.confidence<=0)continue;
 labels.push({label:x.label.trim(),intensity:x.intensity,confidence:x.confidence,evidence_kind:"inferred"});}
 const confidence=typeof a.confidence==="number"&&a.confidence>=0&&a.confidence<=1?a.confidence:0;
 const rationale=typeof a.rationale==="string"?a.rationale.slice(0,500):"";
 if(!Object.keys(out).length&&!labels.length)return null;
 return {dimensions:out,emotion_labels:labels,evidence_basis:evidenceBasis,confidence,rationale};
}
export function evolveAffectState(previous:unknown,appraisal:AffectAppraisal){
 const before=rec(previous),oldDims=rec(before.dimensions);
 const next:Record<string,Record<string,AffectMeasurement>>={...oldDims as Record<string,Record<string,AffectMeasurement>>};
 const delta:Record<string,Record<string,number>>={};
 let stateChanged=false;
 for(const [g,updates] of Object.entries(appraisal.dimensions)){const old=rec(oldDims[g]),ng:Record<string,AffectMeasurement>={...old as Record<string,AffectMeasurement>},gd:Record<string,number>={};
 for(const [k,m] of Object.entries(updates)){if(!Number.isFinite(m.confidence)||m.confidence<=0)continue;
 const oldItem=rec(old[k]);const ov=oldItem.value,oldValue=typeof ov==="number"?ov:null;
 const alpha=Math.max(0,Math.min(0.65,m.confidence*0.65));const value=oldValue===null?m.value:oldValue+(m.value-oldValue)*alpha;
 const oldConfidence=oldItem.confidence;const confidence=typeof oldConfidence==="number"&&Number.isFinite(oldConfidence)&&oldConfidence>=0&&oldConfidence<=1
  ? oldConfidence+(m.confidence-oldConfidence)*alpha : m.confidence;
 ng[k]={value,confidence,evidence_kind:oldValue===null?m.evidence_kind:(oldItem.evidence_kind==="self_report"&&m.evidence_kind==="self_report"?"self_report":"inferred")};
 if(oldValue===null||Math.abs(value-oldValue)>0.0001||oldConfidence!==confidence)stateChanged=true;
 if(oldValue!==null&&Math.abs(value-oldValue)>0.0001)gd[k]=Number((value-oldValue).toFixed(6));}
 if(Object.keys(ng).length)next[g]=ng;if(Object.keys(gd).length)delta[g]=gd;}
 const after:Record<string,unknown>={schema_version:"aurora.affect.v1",dimensions:next};
 const labelsChanged=appraisal.emotion_labels.length>0&&JSON.stringify(appraisal.emotion_labels)!==JSON.stringify(before.emotion_labels??[]);
 if(appraisal.emotion_labels.length)after.emotion_labels=appraisal.emotion_labels;else if(Array.isArray(before.emotion_labels))after.emotion_labels=before.emotion_labels;
 return {before:Object.keys(before).length?before:{schema_version:"aurora.affect.v1",dimensions:{}},after,delta,changed:stateChanged||labelsChanged};
}


export type AffectTemporalSignal = {
  group: string;
  dimension: string;
  observation_count: number;
  positive_changes: number;
  negative_changes: number;
  pattern: "repeated_same_direction" | "mixed_directions";
  first_observed_at: string;
  last_observed_at: string;
  observed_span_days: number;
};

/**
 * Summarizes repeated evidence from one resident's append-only affect events.
 * Repetition is not proof of continuous feeling, causation, a stable trait, or
 * a successful regulation strategy. No decay or interpolation is performed.
 */
export function buildAffectTemporalEvidence(events: unknown[]): Record<string, unknown> {
  const buckets = new Map<string, {
    group: string; dimension: string; times: number[];
    positive: number; negative: number;
  }>();
  const allowedGroups = new Set(Object.keys(RANGES));
  const source = Array.isArray(events) ? events.slice(-40) : [];
  let validEventCount = 0;
  for (const rawEvent of source) {
    const event = rec(rawEvent);
    const occurredAt = typeof event.occurred_at === "string" ? Date.parse(event.occurred_at) : Number.NaN;
    if (!Number.isFinite(occurredAt)) continue;
    const delta = rec(event.affect_delta);
    let eventHadSignal = false;
    for (const [group, rawValues] of Object.entries(delta)) {
      const groupRanges = RANGES[group];
      if (!allowedGroups.has(group) || !groupRanges) continue;
      const values = rec(rawValues);
      for (const [dimension, rawValue] of Object.entries(values)) {
        if (!(dimension in groupRanges) || typeof rawValue !== "number" ||
            !Number.isFinite(rawValue) || Math.abs(rawValue) <= 0.0001 || Math.abs(rawValue) > 2) continue;
        const key = group + "." + dimension;
        const bucket = buckets.get(key) ?? {
          group, dimension, times: [], positive: 0, negative: 0,
        };
        bucket.times.push(occurredAt);
        if (rawValue > 0) bucket.positive++;
        else bucket.negative++;
        buckets.set(key, bucket);
        eventHadSignal = true;
      }
    }
    if (eventHadSignal) validEventCount++;
  }
  const signals: AffectTemporalSignal[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.times.length < 2) continue;
    const first = Math.min(...bucket.times);
    const last = Math.max(...bucket.times);
    signals.push({
      group: bucket.group,
      dimension: bucket.dimension,
      observation_count: bucket.times.length,
      positive_changes: bucket.positive,
      negative_changes: bucket.negative,
      pattern: bucket.positive > 0 && bucket.negative > 0
        ? "mixed_directions" : "repeated_same_direction",
      first_observed_at: new Date(first).toISOString(),
      last_observed_at: new Date(last).toISOString(),
      observed_span_days: Number(((last - first) / 86_400_000).toFixed(3)),
    });
  }
  signals.sort((left, right) =>
    right.observation_count - left.observation_count ||
    right.observed_span_days - left.observed_span_days ||
    left.group.localeCompare(right.group) ||
    left.dimension.localeCompare(right.dimension)
  );
  const allTimes = [...buckets.values()].flatMap((bucket) => bucket.times);
  const spanDays = allTimes.length > 1
    ? Number(((Math.max(...allTimes) - Math.min(...allTimes)) / 86_400_000).toFixed(3))
    : 0;
  return {
    schema_version: "aurora.affect_temporal_evidence.v1",
    basis: "append_only_recorded_affect_deltas",
    sampled_event_count: source.length,
    events_with_valid_affect_changes: validEventCount,
    repeated_dimension_count: signals.length,
    observed_span_days: spanDays,
    repeated_signals: signals.slice(0, 24),
    interpretation_limits: [
      "Repeated observations do not prove continuous emotional persistence.",
      "Mixed directions must remain visible; do not average away conflict.",
      "Temporal distance alone does not prove recovery, decay, forgetting, or a stable trait.",
      "A regulation strategy is not effective unless an actual outcome is separately evidenced.",
    ],
  };
}


/** Keep interpersonal dimensions separate from resident-wide affect. */
export function withoutRelationalAffect(appraisal: AffectAppraisal): AffectAppraisal {
  const dimensions = { ...appraisal.dimensions };
  delete dimensions.relational;
  return { ...appraisal, dimensions };
}

/** A relational appraisal is target-scoped only when a verified peer ID exists. */
export function targetRelationalAffect(appraisal: AffectAppraisal): AffectAppraisal | null {
  const relational = appraisal.dimensions.relational;
  if (!relational || !Object.keys(relational).length) return null;
  return { ...appraisal, dimensions: { relational } };
}

/** Recover the latest private affect state for one exact peer from append-only event metadata. */
export function buildTargetAffectState(events: unknown[], targetAgentId: string): Record<string, unknown> | null {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetAgentId)) return null;
  let latest: Record<string, unknown> | null = null;
  for (const raw of Array.isArray(events) ? events : []) {
    const event = rec(raw);
    const appraisal = rec(event.appraisal);
    if (appraisal.target_agent_id !== targetAgentId) continue;
    const after = rec(appraisal.target_affect_after);
    if (Object.keys(after).length) latest = after;
  }
  return latest;
}

/** Build target-only temporal evidence; events for every other peer are excluded. */
export function buildTargetAffectTemporalEvidence(events: unknown[], targetAgentId: string): Record<string, unknown> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetAgentId)) {
    return { schema_version: "aurora.target_affect_temporal.v1", target_agent_id: null, repeated_signals: [], sampled_event_count: 0 };
  }
  const scoped = (Array.isArray(events) ? events : []).filter((raw) => {
    const appraisal = rec(rec(raw).appraisal);
    return appraisal.target_agent_id === targetAgentId;
  }).map((raw) => {
    const event = rec(raw);
    const appraisal = rec(event.appraisal);
    return { occurred_at: event.occurred_at, affect_delta: appraisal.target_affect_delta };
  });
  return {
    schema_version: "aurora.target_affect_temporal.v1",
    target_agent_id: targetAgentId,
    ...buildAffectTemporalEvidence(scoped),
  };
}
