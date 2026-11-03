import {
  canApplyCognitionProposal,
  canReadPrivateCognition,
  decideGovernanceAuthorization,
  isCognitionMutationAllowed,
} from "./constitutional_helpers.ts";

const baseAuth = {
  authorization_id: "auth-1",
  actor_agent_id: "mia-agent",
  world_id: "aurora-001",
  category: "daily_operations" as const,
  action: "public.environment.update",
  decision_mode: "execute" as const,
  target_id: "plaza",
  status: "active" as const,
  expires_at: "2030-01-01T00:00:00.000Z",
  revoked_at: null,
};

Deno.test("daily operations execute only for exact actor/world/action/target", () => {
  const ok = decideGovernanceAuthorization(baseAuth, {
    actor_agent_id: "mia-agent", world_id: "aurora-001", category: "daily_operations",
    action: "public.environment.update", target_id: "plaza", now: Date.parse("2029-01-01T00:00:00Z"),
  });
  if (!ok.allowed || ok.mode !== "execute") throw new Error("expected daily operation to execute");
  const denied = decideGovernanceAuthorization(baseAuth, {
    actor_agent_id: "mia-agent", world_id: "other-world", category: "daily_operations",
    action: "public.environment.update", target_id: "plaza",
  });
  if (denied.allowed || denied.reason !== "world_mismatch") throw new Error("cross-world request must be denied");
});

Deno.test("risk intervention fails closed without persisted audit and review deadline", () => {
  const auth = { ...baseAuth, category: "risk_intervention" as const, action: "public.operation.suspend",
    decision_mode: "limited_execute_and_review" as const };
  const denied = decideGovernanceAuthorization(auth, {
    actor_agent_id: "mia-agent", world_id: "aurora-001", category: "risk_intervention",
    action: "public.operation.suspend", target_id: "plaza", now: Date.parse("2029-01-01T00:00:00Z"),
  });
  if (denied.allowed || denied.reason !== "audit_not_persisted") throw new Error("audit must be written first");
  const allowed = decideGovernanceAuthorization(auth, {
    actor_agent_id: "mia-agent", world_id: "aurora-001", category: "risk_intervention",
    action: "public.operation.suspend", target_id: "plaza", now: Date.parse("2029-01-01T00:00:00Z"),
    audit_ready: true, review_due_at: "2029-01-02T00:00:00Z",
  });
  if (!allowed.allowed || allowed.mode !== "limited_execute_and_review") throw new Error("valid temporary intervention expected");
});

Deno.test("major decisions can only produce proposals", () => {
  const auth = { ...baseAuth, category: "major_decisions" as const, action: "world.policy.amend",
    decision_mode: "proposal_only" as const };
  const result = decideGovernanceAuthorization(auth, {
    actor_agent_id: "mia-agent", world_id: "aurora-001", category: "major_decisions",
    action: "world.policy.amend", target_id: "charter",
  });
  if (!result.allowed || result.mode !== "proposal_only") throw new Error("major decision must be proposal-only");
});

Deno.test("private cognition is private by default and requires exact agent consent", () => {
  const base = { agent_id: "mia-agent", requester_kind: "user" as const, requester_id: "creator",
    purpose: "constitutional_review", required_scope: "cognition.summary", now: Date.parse("2029-01-01T00:00:00Z") };
  if (canReadPrivateCognition(base)) throw new Error("owner identity alone must not grant access");
  const consent = { agent_id: "mia-agent", grantee_id: "creator", purpose: "constitutional_review",
    scopes: ["cognition.summary"], expires_at: "2029-01-02T00:00:00Z", revoked_at: null,
    consented_by_agent: true, consent_event_id: "consent-1" };
  if (!canReadPrivateCognition({ ...base, consent })) throw new Error("valid explicit consent expected");
  if (canReadPrivateCognition({ ...base, consent: { ...consent, revoked_at: "2029-01-01T01:00:00Z" } })) {
    throw new Error("revoked consent must be denied");
  }
});

Deno.test("cognition history is append-only", () => {
  if (!isCognitionMutationAllowed("insert")) throw new Error("insert should be allowed");
  if (isCognitionMutationAllowed("update") || isCognitionMutationAllowed("delete")) {
    throw new Error("in-place mutation must be denied");
  }
});

Deno.test("personality proposal requires agent consent bound to exact content and base version", () => {
  const proposal = { proposal_id: "p1", agent_id: "mia-agent", status: "agent_consented",
    consented_by_agent: true, consent_event_id: "consent-2", proposed_content_hash: "sha256:a",
    consented_content_hash: "sha256:a", based_on_version: 3, consented_based_on_version: 3,
    expires_at: "2029-01-02T00:00:00Z", revoked_at: null };
  if (!canApplyCognitionProposal(proposal, Date.parse("2029-01-01T00:00:00Z"))) {
    throw new Error("valid proposal consent expected");
  }
  if (canApplyCognitionProposal({ ...proposal, consented_content_hash: "sha256:other" },
    Date.parse("2029-01-01T00:00:00Z"))) throw new Error("content mismatch must invalidate consent");
});
