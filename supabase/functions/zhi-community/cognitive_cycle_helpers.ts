import { validateMouRecord, type MouRecord } from "./ontology_helpers.ts";

export type FeedbackInput = {
  id: string;
  source_id: string;
  event_time: string;
  recorded_at: string;
  observed_outcome: string;
  /** Must be grounded in the source's reliability; never silently default to certainty. */
  confidence: number;
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
  if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) {
    throw new Error("invalid_feedback_confidence");
  }
  if (!Number.isFinite(Date.parse(input.event_time)) || !Number.isFinite(Date.parse(input.recorded_at))) {
    throw new Error("invalid_feedback_timestamp");
  }
  const feedback: MouRecord = {
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
    confidence: input.confidence,
    event_time: input.event_time,
    recorded_at: input.recorded_at,
    inferred_at: null,
    hypothesis: null,
    prediction: null,
    version: 1,
  };
  const validation = validateMouRecord(feedback);
  if (!validation.valid) throw new Error(`invalid_feedback_record:${validation.errors.join(",")}`);
  return feedback;
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

/** Requires real, validated feedback records linked to this exact hypothesis and principal. */
export function buildRevisionProposal(
  current: MouRecord,
  proposal: {
    id: string;
    feedback_records: MouRecord[];
    proposed_state: Record<string, unknown>;
    created_at: string;
  },
): RevisionProposal {
  if (!proposal.id.trim() || !proposal.feedback_records.length) {
    throw new Error("proposal_and_feedback_records_required");
  }
  if (!validateMouRecord(current).valid) throw new Error("invalid_current_record");
  if (!proposal.proposed_state || typeof proposal.proposed_state !== "object" ||
      Array.isArray(proposal.proposed_state)) {
    throw new Error("proposed_state_must_be_object");
  }
  if (!Number.isFinite(Date.parse(proposal.created_at))) throw new Error("invalid_proposal_timestamp");

  const ids = proposal.feedback_records.map((record) => record.id);
  if (new Set(ids).size !== ids.length) throw new Error("duplicate_feedback_records");

  for (const feedback of proposal.feedback_records) {
    if (!validateMouRecord(feedback).valid) throw new Error("invalid_feedback_record");
    if (feedback.object_type !== "feedback" || feedback.evidence_kind !== "observation") {
      throw new Error("source_must_be_observed_feedback");
    }
    if (feedback.owner_user_id !== current.owner_user_id || feedback.agent_id !== current.agent_id) {
      throw new Error("feedback_principal_mismatch");
    }
    if (feedback.object_id !== current.object_id ||
        !feedback.relation_ids.includes(current.id) ||
        feedback.state.hypothesis_id !== current.id) {
      throw new Error("feedback_hypothesis_mismatch");
    }
  }

  return {
    id: proposal.id,
    owner_user_id: current.owner_user_id,
    agent_id: current.agent_id,
    target_object_id: current.object_id,
    based_on_record_id: current.id,
    based_on_version: current.version,
    feedback_record_ids: ids,
    proposed_state: structuredClone(proposal.proposed_state),
    status: "shadow_proposed",
    requires_human_review: true,
    created_at: proposal.created_at,
  };
}


export type CognitionActionEvidence = {
  outcomes: Array<{
    action_kind: "observatory_cue_choice" | "resident_movement" | "resident_social_message";
    status: string;
    execution_evidence: string;
    action_ref?: string;
    source_turn_id?: string;
  }>;
  evidence_refs: Array<{
    kind: "runtime_action_observation";
    id: string;
    action_kind: string;
    status: string;
    source_turn_id?: string;
  }>;
  counts: {
    observed_count: number;
    confirmed_action_count: number;
    pending_followup_count: number;
    not_executed_or_failed_count: number;
    cue_choice_commit_count: number;
  };
};

/**
 * Normalize only runtime-observed action results for a resident's private cognition cycle.
 * A committed cue choice is not a completed exploration; a virtual move is not physical
 * movement; a sent message is not proof of reading, acceptance, or reciprocity.
 */
export function buildCognitionActionEvidence(raw: unknown): CognitionActionEvidence {
  const allowedStatuses: Record<string, Set<string>> = {
    observatory_cue_choice: new Set(["explore", "defer", "dismiss", "complete"]),
    resident_movement: new Set(["moved"]),
    resident_social_message: new Set([
      "sent", "sent_pending_confirmation", "sent_pending_acceptance", "not_sent", "failed_safely",
    ]),
  };
  const source = Array.isArray(raw) ? raw.slice(0, 12) : [];
  const outcomes: CognitionActionEvidence["outcomes"] = [];
  const evidence_refs: CognitionActionEvidence["evidence_refs"] = [];
  const counts = {
    observed_count: 0,
    confirmed_action_count: 0,
    pending_followup_count: 0,
    not_executed_or_failed_count: 0,
    cue_choice_commit_count: 0,
  };

  for (const value of source) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const item = value as Record<string, unknown>;
    const kind = typeof item.action_kind === "string" ? item.action_kind : "";
    const status = typeof item.status === "string" ? item.status : "";
    if (!allowedStatuses[kind]?.has(status)) continue;

    let executionEvidence = "unclassified";
    if (kind === "resident_movement" && status === "moved") {
      executionEvidence = "virtual_move_committed";
      counts.confirmed_action_count++;
    } else if (kind === "observatory_cue_choice") {
      executionEvidence = "cue_choice_committed_only";
      counts.cue_choice_commit_count++;
    } else if (kind === "resident_social_message" && status === "sent") {
      executionEvidence = "message_send_confirmed_read_and_response_unknown";
      counts.confirmed_action_count++;
    } else if (kind === "resident_social_message" &&
      ["sent_pending_confirmation", "sent_pending_acceptance"].includes(status)) {
      executionEvidence = "message_sent_followup_pending";
      counts.pending_followup_count++;
    } else if (kind === "resident_social_message" && ["not_sent", "failed_safely"].includes(status)) {
      executionEvidence = "message_not_sent_or_failed";
      counts.not_executed_or_failed_count++;
    }

    const actionRef = [
      item.movement_request_id, item.message_id, item.intent_id, item.cue_id,
    ].find((candidate): candidate is string =>
      typeof candidate === "string" && candidate.trim().length > 0 && candidate.length <= 160
    );
    const sourceTurnId = typeof item.source_turn_id === "string" &&
      item.source_turn_id.trim().length > 0 && item.source_turn_id.length <= 160
      ? item.source_turn_id : undefined;
    const outcome = {
      action_kind: kind as CognitionActionEvidence["outcomes"][number]["action_kind"],
      status,
      execution_evidence: executionEvidence,
      ...(actionRef ? { action_ref: actionRef } : {}),
      ...(sourceTurnId ? { source_turn_id: sourceTurnId } : {}),
    };
    outcomes.push(outcome);
    counts.observed_count++;
    if (actionRef) evidence_refs.push({
      kind: "runtime_action_observation",
      id: actionRef,
      action_kind: kind,
      status,
      ...(sourceTurnId ? { source_turn_id: sourceTurnId } : {}),
    });
  }

  return { outcomes, evidence_refs, counts };
}
