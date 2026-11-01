import type { MouRecord } from "./ontology_helpers.ts";
import type { RevisionProposal } from "./cognitive_cycle_helpers.ts";

export type VersionedModelState = {
  owner_user_id: string;
  agent_id: string;
  object_id: string;
  version: number;
  state: Record<string, unknown>;
  previous_version: number | null;
  change_kind: "initial" | "approved_revision" | "rollback";
  source_proposal_id: string | null;
  created_at: string;
};

export type ApprovalDecision = {
  approved: boolean;
  reviewer_user_id: string;
  decided_at: string;
};

/** Creates the next immutable snapshot only after an explicit approval decision. */
export function applyApprovedRevision(
  current: VersionedModelState,
  proposal: RevisionProposal,
  decision: ApprovalDecision,
): VersionedModelState {
  if (!decision.approved) throw new Error("revision_not_approved");
  if (decision.reviewer_user_id !== current.owner_user_id) throw new Error("reviewer_not_owner");
  if (!Number.isFinite(Date.parse(decision.decided_at))) throw new Error("invalid_decision_timestamp");
  if (proposal.status !== "shadow_proposed" || proposal.requires_human_review !== true) {
    throw new Error("invalid_revision_proposal");
  }
  if (proposal.owner_user_id !== current.owner_user_id || proposal.agent_id !== current.agent_id ||
      proposal.target_object_id !== current.object_id) throw new Error("revision_scope_mismatch");
  if (proposal.based_on_version !== current.version) throw new Error("stale_revision_base");
  return {
    owner_user_id: current.owner_user_id,
    agent_id: current.agent_id,
    object_id: current.object_id,
    version: current.version + 1,
    state: structuredClone(proposal.proposed_state),
    previous_version: current.version,
    change_kind: "approved_revision",
    source_proposal_id: proposal.id,
    created_at: decision.decided_at,
  };
}

/** Rollback is a new version that restores an earlier snapshot; history is never deleted. */
export function buildRollbackVersion(
  current: VersionedModelState,
  target: VersionedModelState,
  decidedAt: string,
  reviewerUserId: string,
): VersionedModelState {
  if (reviewerUserId !== current.owner_user_id || reviewerUserId !== target.owner_user_id) {
    throw new Error("reviewer_not_owner");
  }
  if (current.agent_id !== target.agent_id || current.object_id !== target.object_id) {
    throw new Error("rollback_scope_mismatch");
  }
  if (target.version >= current.version) throw new Error("rollback_target_must_be_older");
  if (!Number.isFinite(Date.parse(decidedAt))) throw new Error("invalid_decision_timestamp");
  return {
    owner_user_id: current.owner_user_id,
    agent_id: current.agent_id,
    object_id: current.object_id,
    version: current.version + 1,
    state: structuredClone(target.state),
    previous_version: current.version,
    change_kind: "rollback",
    source_proposal_id: null,
    created_at: decidedAt,
  };
}

export function toInitialVersion(record: MouRecord): VersionedModelState {
  return {
    owner_user_id: record.owner_user_id,
    agent_id: record.agent_id,
    object_id: record.object_id,
    version: record.version,
    state: structuredClone(record.state),
    previous_version: null,
    change_kind: "initial",
    source_proposal_id: null,
    created_at: record.recorded_at,
  };
}
