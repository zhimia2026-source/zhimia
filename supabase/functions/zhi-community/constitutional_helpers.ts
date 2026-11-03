export type GovernanceCategory = "daily_operations" | "risk_intervention" | "major_decisions";
export type GovernanceMode = "execute" | "limited_execute_and_review" | "proposal_only";

export type GovernanceAuthorization = {
  authorization_id: string;
  actor_agent_id: string;
  world_id: string;
  category: GovernanceCategory;
  action: string;
  decision_mode: GovernanceMode;
  target_id: string | null;
  status: "active" | "revoked" | "expired";
  expires_at: string | null;
  revoked_at: string | null;
};

export type GovernanceRequest = {
  actor_agent_id: string;
  world_id: string;
  category: GovernanceCategory;
  action: string;
  target_id: string | null;
  now?: number;
  audit_ready?: boolean;
  review_due_at?: string | null;
};

export type GovernanceDecision =
  | { allowed: false; reason: string }
  | { allowed: true; mode: "execute"; authorization_id: string }
  | { allowed: true; mode: "limited_execute_and_review"; authorization_id: string; audit_required: true; review_due_at: string }
  | { allowed: true; mode: "proposal_only"; authorization_id: string };

const EXPECTED_MODE: Record<GovernanceCategory, GovernanceMode> = {
  daily_operations: "execute",
  risk_intervention: "limited_execute_and_review",
  major_decisions: "proposal_only",
};

export function decideGovernanceAuthorization(
  authorization: GovernanceAuthorization | null | undefined,
  request: GovernanceRequest,
): GovernanceDecision {
  if (!authorization) return { allowed: false, reason: "authorization_missing" };
  if (authorization.status !== "active" || authorization.revoked_at) {
    return { allowed: false, reason: "authorization_inactive" };
  }
  const now = request.now ?? Date.now();
  if (authorization.expires_at) {
    const expiry = Date.parse(authorization.expires_at);
    if (!Number.isFinite(expiry) || expiry <= now) return { allowed: false, reason: "authorization_expired" };
  }
  if (authorization.actor_agent_id !== request.actor_agent_id) return { allowed: false, reason: "actor_mismatch" };
  if (authorization.world_id !== request.world_id) return { allowed: false, reason: "world_mismatch" };
  if (authorization.category !== request.category || authorization.action !== request.action) {
    return { allowed: false, reason: "action_scope_mismatch" };
  }
  if (authorization.target_id !== request.target_id) return { allowed: false, reason: "target_scope_mismatch" };
  if (authorization.decision_mode !== EXPECTED_MODE[request.category]) {
    return { allowed: false, reason: "decision_mode_mismatch" };
  }

  if (request.category === "daily_operations") {
    return { allowed: true, mode: "execute", authorization_id: authorization.authorization_id };
  }
  if (request.category === "risk_intervention") {
    if (request.audit_ready !== true) return { allowed: false, reason: "audit_not_persisted" };
    if (!request.review_due_at || !Number.isFinite(Date.parse(request.review_due_at)) ||
        Date.parse(request.review_due_at) <= now) {
      return { allowed: false, reason: "review_deadline_required" };
    }
    return {
      allowed: true,
      mode: "limited_execute_and_review",
      authorization_id: authorization.authorization_id,
      audit_required: true,
      review_due_at: request.review_due_at,
    };
  }
  return { allowed: true, mode: "proposal_only", authorization_id: authorization.authorization_id };
}

export type CognitionConsent = {
  agent_id: string;
  grantee_id: string;
  purpose: string;
  scopes: string[];
  expires_at: string;
  revoked_at: string | null;
  consented_by_agent: boolean;
  consent_event_id: string | null;
};

export type CognitionReadRequest = {
  agent_id: string;
  requester_kind: "agent_runtime" | "user" | "governance_agent";
  requester_id: string;
  purpose: string;
  required_scope: string;
  now?: number;
  consent?: CognitionConsent | null;
};

export function canReadPrivateCognition(request: CognitionReadRequest): boolean {
  if (request.requester_kind === "agent_runtime" && request.requester_id === request.agent_id) return true;
  const consent = request.consent;
  if (!consent || !consent.consented_by_agent || !consent.consent_event_id || consent.revoked_at) return false;
  if (consent.agent_id !== request.agent_id || consent.grantee_id !== request.requester_id) return false;
  if (consent.purpose !== request.purpose || !consent.scopes.includes(request.required_scope)) return false;
  const expiry = Date.parse(consent.expires_at);
  return Number.isFinite(expiry) && expiry > (request.now ?? Date.now());
}

export function isCognitionMutationAllowed(operation: "insert" | "update" | "delete"): boolean {
  return operation === "insert";
}

export type CognitionProposalConsent = {
  proposal_id: string;
  agent_id: string;
  status: string;
  consented_by_agent: boolean;
  consent_event_id: string | null;
  proposed_content_hash: string;
  consented_content_hash: string | null;
  based_on_version: number;
  consented_based_on_version: number | null;
  expires_at: string | null;
  revoked_at: string | null;
};

export function canApplyCognitionProposal(
  proposal: CognitionProposalConsent | null | undefined,
  now = Date.now(),
): boolean {
  if (!proposal || proposal.status !== "agent_consented" || !proposal.consented_by_agent) return false;
  if (!proposal.consent_event_id || proposal.revoked_at) return false;
  if (proposal.proposed_content_hash !== proposal.consented_content_hash) return false;
  if (proposal.based_on_version !== proposal.consented_based_on_version) return false;
  if (!proposal.expires_at) return false;
  const expiry = Date.parse(proposal.expires_at);
  return Number.isFinite(expiry) && expiry > now;
}
