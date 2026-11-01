export const EVIDENCE_KINDS = ["observation", "fact", "inference", "hypothesis", "unknown"] as const;
export type EvidenceKind = typeof EVIDENCE_KINDS[number];

export type MouRecord = {
  id: string;
  owner_user_id: string;
  agent_id: string;
  object_type: "self" | "other" | "world" | "relation" | "change" | "feedback";
  object_id: string;
  state: Record<string, unknown>;
  relation_ids: string[];
  evidence_kind: EvidenceKind;
  source_ids: string[];
  confidence: number | null;
  event_time: string | null;
  recorded_at: string;
  inferred_at: string | null;
  hypothesis: string | null;
  prediction: string | null;
  version: number;
};

export type MouValidation = { valid: boolean; errors: string[] };

/** Pure validation only: no storage, network, model calls, or production writes. */
export function validateMouRecord(value: unknown): MouValidation {
  const errors: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, errors: ["record_must_be_object"] };
  }
  const r = value as Record<string, unknown>;
  const requiredStrings = ["id", "owner_user_id", "agent_id", "object_id", "recorded_at"] as const;
  for (const key of requiredStrings) {
    if (typeof r[key] !== "string" || !(r[key] as string).trim()) errors.push(`invalid_${key}`);
  }
  const objectTypes = ["self", "other", "world", "relation", "change", "feedback"];
  if (!objectTypes.includes(String(r.object_type))) errors.push("invalid_object_type");
  if (!r.state || typeof r.state !== "object" || Array.isArray(r.state)) errors.push("invalid_state");
  if (!Array.isArray(r.relation_ids) || r.relation_ids.some(x => typeof x !== "string" || !x.trim())) errors.push("invalid_relation_ids");
  if (!EVIDENCE_KINDS.includes(r.evidence_kind as EvidenceKind)) errors.push("invalid_evidence_kind");
  if (!Array.isArray(r.source_ids) || r.source_ids.some(x => typeof x !== "string" || !x.trim())) errors.push("invalid_source_ids");
  if (r.evidence_kind === "unknown" && r.confidence !== null) errors.push("unknown_confidence_must_be_null");
  if (r.evidence_kind !== "unknown" && (typeof r.confidence !== "number" || !Number.isFinite(r.confidence) || r.confidence < 0 || r.confidence > 1)) errors.push("invalid_confidence");
  if (r.evidence_kind === "observation" && (!Array.isArray(r.source_ids) || r.source_ids.length === 0)) errors.push("observation_requires_source");
  if (r.evidence_kind === "fact" && (!Array.isArray(r.source_ids) || r.source_ids.length === 0)) errors.push("fact_requires_source");
  if (typeof r.recorded_at !== "string" || !Number.isFinite(Date.parse(r.recorded_at))) errors.push("invalid_recorded_at");
  for (const key of ["event_time", "inferred_at"] as const) {
    if (r[key] !== null && (typeof r[key] !== "string" || !Number.isFinite(Date.parse(r[key] as string)))) errors.push(`invalid_${key}`);
  }
  if (r.evidence_kind === "inference" && (typeof r.inferred_at !== "string" || !r.inferred_at)) errors.push("inference_requires_inferred_at");
  if (r.evidence_kind === "hypothesis") {
    if (typeof r.hypothesis !== "string" || !r.hypothesis.trim()) errors.push("hypothesis_requires_text");
    if (typeof r.inferred_at !== "string" || !r.inferred_at) errors.push("hypothesis_requires_inferred_at");
    if (!Array.isArray(r.source_ids) || r.source_ids.length === 0) errors.push("hypothesis_requires_source");
  }
  if (r.evidence_kind === "unknown" &&
      (r.inferred_at !== null || r.hypothesis !== null || r.prediction !== null)) {
    errors.push("unknown_must_not_claim_inference_or_prediction");
  }
  if (r.evidence_kind === "observation" || r.evidence_kind === "fact") {
    if (r.inferred_at !== null || r.hypothesis !== null) errors.push("direct_evidence_must_not_claim_inference");
  }
  if (r.prediction !== null && (typeof r.prediction !== "string" || !r.prediction.trim())) errors.push("invalid_prediction");
  if (!Number.isInteger(r.version) || (r.version as number) < 1) errors.push("invalid_version");
  return { valid: errors.length === 0, errors };
}

/** Private cognition records are visible only to the exact owner and agent pair. */
export function canAccessPrivateCognition(
  record: Pick<MouRecord, "owner_user_id" | "agent_id"> | null,
  actorUserId: string,
  actorAgentId: string,
): boolean {
  return !!record && !!actorUserId && !!actorAgentId &&
    record.owner_user_id === actorUserId && record.agent_id === actorAgentId;
}
