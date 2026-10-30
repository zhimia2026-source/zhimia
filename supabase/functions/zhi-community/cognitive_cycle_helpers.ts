import type { MouRecord } from "./ontology_helpers.ts";

export type FeedbackInput = {
  id: string;
  source_id: string;
  event_time: string;
  recorded_at: string;
  observed_outcome: string;
};

/** Creates an append-only feedback record; it never edits the source hypothesis. */
export function buildFeedbackRecord(
  hypothesis: MouRecord,
  input: FeedbackInput,
): MouRecord {
  if (hypothesis.evidence_kind !== "hypothesis" || !hypothesis.hypothesis?.trim()) {
    throw new Error("source_must_be_hypothesis");
  }
  if (!hypothesis.prediction?.trim()) throw new Error("hypothesis_requires_prediction");
  if (!input.id.trim() || !input.source_id.trim() || !input.observed_outcome.trim()) {
    throw new Error("feedback_fields_required");
  }
  if (!Number.isFinite(Date.parse(input.event_time)) || !Number.isFinite(Date.parse(input.recorded_at))) {
    throw new Error("invalid_feedback_timestamp");
  }
  return {
    id: input.id,
    owner_user_id: hypothesis.owner_user_id,
    agent_id: hypothesis.agent_id,
    object_type: "feedback",
    object_id: hypothesis.object_id,
    state: {
      hypothesis_id: hypothesis.id,
      prediction: hypothesis.prediction,
      observed_outcome: input.observed_outcome,
      assessment: "pending_review",
    },
    relation_ids: [hypothesis.id, ...hypothesis.relation_ids],
    evidence_kind: "observation",
    source_ids: [input.source_id],
    confidence: 1,
    event_time: input.event_time,
    recorded_at: input.recorded_at,
    inferred_at: null,
    hypothesis: null,
    prediction: null,
    version: 1,
  };
}

export type RevisionProposal = {
  id: string;
  owner_user_id: string;
  agent_id: string;
  target_object_id: string;
  based_on_record_id: string;
  based_on_version: number;
  feedback_record_ids: string[];
  proposed_state: Record<string, unknown>;
  status: "shadow_proposed";
  requires_human_review: true;
  created_at: string;
};

/** Proposes a versioned state change without mutating the current model. */
export function buildRevisionProposal(
  current: MouRecord,
  proposal: {
    id: string;
    feedback_record_ids: string[];
    proposed_state: Record<string, unknown>;
    created_at: string;
  },
): RevisionProposal {
  if (!proposal.id.trim() || !proposal.feedback_record_ids.length ||
      proposal.feedback_record_ids.some((id) => !id.trim())) {
    throw new Error("proposal_and_feedback_ids_required");
  }
  if (!proposal.proposed_state || typeof proposal.proposed_state !== "object" ||
      Array.isArray(proposal.proposed_state)) {
    throw new Error("proposed_state_must_be_object");
  }
  if (!Number.isFinite(Date.parse(proposal.created_at))) throw new Error("invalid_proposal_timestamp");
  return {
    id: proposal.id,
    owner_user_id: current.owner_user_id,
    agent_id: current.agent_id,
    target_object_id: current.object_id,
    based_on_record_id: current.id,
    based_on_version: current.version,
    feedback_record_ids: [...proposal.feedback_record_ids],
    proposed_state: structuredClone(proposal.proposed_state),
    status: "shadow_proposed",
    requires_human_review: true,
    created_at: proposal.created_at,
  };
}
