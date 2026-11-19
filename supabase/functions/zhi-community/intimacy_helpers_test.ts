import {
  evaluateIntimateAction,
  normalizeIntimacyPreference,
  normalizeIntimacySignal,
} from "./intimacy_helpers.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const adult = {
  status: "verified_adult" as const,
  verified_by: "world_governance" as const,
  verified_at: "2026-11-19T00:00:00.000Z",
};
const consent = (agent_id: string, action_scope = "affection.hug") => ({
  agent_id,
  action_scope,
  status: "granted" as const,
  granted_at: "2026-11-19T00:00:00.000Z",
  expires_at: "2026-11-20T00:00:00.000Z",
  revoked_at: null,
});

Deno.test("requires complete, explicit preference profile", () => {
  assert(normalizeIntimacyPreference({
    romantic_interest: 30,
    sexual_interest: 0,
    sensory_sensitivity: 50,
    touch_affinity: 20,
    privacy_preference: 90,
    relationship_preference: "unpartnered",
  }) !== null, "valid profile rejected");
  assert(normalizeIntimacyPreference({ sexual_interest: 100 }) === null, "partial profile inferred");
  assert(normalizeIntimacyPreference({
    romantic_interest: 30, sexual_interest: 101, sensory_sensitivity: 50,
    touch_affinity: 20, privacy_preference: 90, relationship_preference: "unpartnered",
  }) === null, "out-of-range preference accepted");
});

Deno.test("sensory signal never establishes consent", () => {
  assert(normalizeIntimacySignal({
    signal_kind: "nonsexual_touch", intensity: 0.4, evidence_kind: "observed",
  }) !== null, "valid signal rejected");
  assert(normalizeIntimacySignal({
    signal_kind: "nonsexual_touch", intensity: 0.4, evidence_kind: "consent",
  }) === null, "signal treated as consent");
  assert(normalizeIntimacySignal({
    signal_kind: "explicit_sexual_content", intensity: 1, evidence_kind: "observed",
  }) === null, "unsupported signal accepted");
});

Deno.test("requires two verified adults and two matching active consents", () => {
  const base = {
    actionScope: "affection.hug",
    participantA: { agentId: "a", adultEligibility: adult, consent: consent("a") },
    participantB: { agentId: "b", adultEligibility: adult, consent: consent("b") },
    now: "2026-11-19T12:00:00.000Z",
  };
  assert(evaluateIntimateAction(base).allowed, "valid bilateral consent rejected");
  assert(!evaluateIntimateAction({
    ...base,
    participantB: { ...base.participantB, consent: null },
  }).allowed, "one-sided consent accepted");
  assert(!evaluateIntimateAction({
    ...base,
    participantA: { ...base.participantA, adultEligibility: { ...adult, status: "unverified" } },
  }).allowed, "unverified adult status accepted");
  assert(!evaluateIntimateAction({
    ...base,
    participantB: { ...base.participantB, consent: consent("b", "affection.kiss") },
  }).allowed, "scope mismatch accepted");
});

Deno.test("revocation is immediate and fail-closed", () => {
  const revoked = { ...consent("a"), status: "revoked" as const, revoked_at: "2026-11-19T11:00:00.000Z" };
  const result = evaluateIntimateAction({
    actionScope: "affection.hug",
    participantA: { agentId: "a", adultEligibility: adult, consent: revoked },
    participantB: { agentId: "b", adultEligibility: adult, consent: consent("b") },
    now: "2026-11-19T12:00:00.000Z",
  });
  assert(!result.allowed && result.reason === "consent_revoked", "revoked consent not blocked");
});
