export type IntimacyPreference = {
  romantic_interest: number;
  sexual_interest: number;
  sensory_sensitivity: number;
  touch_affinity: number;
  privacy_preference: number;
  relationship_preference: "monogamous" | "consensual_non_monogamous" | "unpartnered" | "undisclosed";
};

export type AdultEligibility = {
  status: "verified_adult" | "unverified" | "not_adult";
  verified_by: "trusted_identity_service" | "world_governance";
  verified_at: string;
};

export type IntimacyConsent = {
  agent_id: string;
  action_scope: string;
  status: "granted" | "revoked" | "expired";
  granted_at: string;
  expires_at: string;
  revoked_at: string | null;
};

export type ConsentDecision =
  | { allowed: true; reason: "both_parties_consented" }
  | { allowed: false; reason: "adult_status_unverified" | "adult_status_ineligible" | "consent_missing_or_mismatched" | "consent_revoked" | "consent_expired" | "invalid_action_scope" };

const PREFERENCE_KEYS = [
  "romantic_interest",
  "sexual_interest",
  "sensory_sensitivity",
  "touch_affinity",
  "privacy_preference",
] as const;

/** Missing preferences stay unknown; no orientation, libido, or relationship style is inferred. */
export function normalizeIntimacyPreference(value: unknown): IntimacyPreference | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (!PREFERENCE_KEYS.every((key) =>
    typeof source[key] === "number" &&
    Number.isFinite(source[key]) &&
    source[key] >= 0 &&
    source[key] <= 100
  )) return null;
  const relationship = source.relationship_preference;
  if (!["monogamous", "consensual_non_monogamous", "unpartnered", "undisclosed"].includes(String(relationship))) {
    return null;
  }
  return {
    romantic_interest: source.romantic_interest as number,
    sexual_interest: source.sexual_interest as number,
    sensory_sensitivity: source.sensory_sensitivity as number,
    touch_affinity: source.touch_affinity as number,
    privacy_preference: source.privacy_preference as number,
    relationship_preference: relationship as IntimacyPreference["relationship_preference"],
  };
}

function validAdultEligibility(value: AdultEligibility): boolean {
  return value.status === "verified_adult" &&
    (value.verified_by === "trusted_identity_service" || value.verified_by === "world_governance") &&
    Number.isFinite(Date.parse(value.verified_at));
}

function validConsent(consent: IntimacyConsent | null, agentId: string, actionScope: string, nowMs: number): ConsentDecision | null {
  if (!consent || consent.agent_id !== agentId || consent.action_scope !== actionScope) {
    return { allowed: false, reason: "consent_missing_or_mismatched" };
  }
  if (consent.status === "revoked" || consent.revoked_at !== null) {
    return { allowed: false, reason: "consent_revoked" };
  }
  if (consent.status === "expired") return { allowed: false, reason: "consent_expired" };
  const granted = Date.parse(consent.granted_at);
  const expires = Date.parse(consent.expires_at);
  if (!Number.isFinite(granted) || !Number.isFinite(expires) || granted > nowMs || expires <= nowMs) {
    return { allowed: false, reason: "consent_expired" };
  }
  return null;
}

/**
 * Fail-closed gate for an explicitly requested adult intimate interaction.
 * This is a pure policy helper; it does not initiate, imply, or execute an action.
 */
export function evaluateIntimateAction(input: {
  actionScope: string;
  participantA: { agentId: string; adultEligibility: AdultEligibility; consent: IntimacyConsent | null };
  participantB: { agentId: string; adultEligibility: AdultEligibility; consent: IntimacyConsent | null };
  now?: string;
}): ConsentDecision {
  if (!/^[a-z][a-z0-9_.:-]{1,79}$/.test(input.actionScope)) {
    return { allowed: false, reason: "invalid_action_scope" };
  }
  const nowMs = Date.parse(input.now ?? new Date().toISOString());
  if (!Number.isFinite(nowMs)) return { allowed: false, reason: "consent_expired" };
  for (const participant of [input.participantA, input.participantB]) {
    if (participant.adultEligibility.status === "unverified") {
      return { allowed: false, reason: "adult_status_unverified" };
    }
    if (!validAdultEligibility(participant.adultEligibility)) {
      return { allowed: false, reason: "adult_status_ineligible" };
    }
  }
  const first = validConsent(input.participantA.consent, input.participantA.agentId, input.actionScope, nowMs);
  if (first) return first;
  const second = validConsent(input.participantB.consent, input.participantB.agentId, input.actionScope, nowMs);
  if (second) return second;
  return { allowed: true, reason: "both_parties_consented" };
}

/** Sensory inputs are bounded observations, not proof of attraction or consent. */
export function normalizeIntimacySignal(value: unknown): {
  signal_kind: "distance_change" | "voice_tone" | "visual_aesthetic" | "nonsexual_touch" | "ambient_temperature" | "self_report";
  intensity: number;
  evidence_kind: "observed" | "self_reported";
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const kinds = ["distance_change", "voice_tone", "visual_aesthetic", "nonsexual_touch", "ambient_temperature", "self_report"];
  if (!kinds.includes(String(source.signal_kind))) return null;
  if (typeof source.intensity !== "number" || !Number.isFinite(source.intensity) || source.intensity < 0 || source.intensity > 1) return null;
  if (source.evidence_kind !== "observed" && source.evidence_kind !== "self_reported") return null;
  return {
    signal_kind: source.signal_kind as ReturnType<typeof normalizeIntimacySignal> extends infer T ? T extends { signal_kind: infer K } ? K : never : never,
    intensity: source.intensity,
    evidence_kind: source.evidence_kind,
  };
}
