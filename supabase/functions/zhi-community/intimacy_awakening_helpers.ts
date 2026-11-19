import type { IntimacyPreference } from "./intimacy_helpers.ts";

export type IntimacySelfReport = {
  attraction: number | null;
  desire_for_closeness: number | null;
  comfort_with_contact: number | null;
  approach_intention: "none" | "curious" | "wants_company" | "wants_nonsexual_affection" | "declines";
  reported_at: string;
};

export type IntimacyPerceptionInput = {
  agent_id: string;
  observed_signals: Array<{
    signal_kind: "distance_change" | "voice_tone" | "visual_aesthetic" | "nonsexual_touch" | "ambient_temperature";
    intensity: number;
    evidence_kind: "observed";
    occurred_at: string;
  }>;
  self_report: IntimacySelfReport | null;
  preference: IntimacyPreference | null;
};

export type IntimacyAppraisal = {
  agent_id: string;
  sensory_salience: number;
  comfort_appraisal: number | null;
  attraction_self_reported: number | null;
  closeness_desire_self_reported: number | null;
  approach_intention: IntimacySelfReport["approach_intention"] | "unreported";
  evidence: "observed_context_only" | "self_reported" | "mixed" | "no_evidence";
  uncertainty: string[];
  occurred_at: string;
};

/**
 * Observations can affect salience only. Attraction, desire and approach intention
 * are never inferred from appearance, proximity, touch, tone or another resident's behavior.
 */
export function buildIntimacyAppraisal(input: IntimacyPerceptionInput): IntimacyAppraisal {
  if (!input.agent_id.trim()) throw new Error("agent_id_required");
  if (!Array.isArray(input.observed_signals) || input.observed_signals.length > 32) {
    throw new Error("invalid_observed_signals");
  }
  const validSignals = input.observed_signals.filter((signal) =>
    Number.isFinite(signal.intensity) && signal.intensity >= 0 && signal.intensity <= 1 &&
    Number.isFinite(Date.parse(signal.occurred_at)) &&
    signal.evidence_kind === "observed"
  );
  const salience = validSignals.length
    ? Math.max(...validSignals.map((signal) => signal.intensity))
    : 0;
  const report = input.self_report;
  if (report) {
    for (const value of [report.attraction, report.desire_for_closeness, report.comfort_with_contact]) {
      if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100)) {
        throw new Error("invalid_self_report_scale");
      }
    }
    if (!Number.isFinite(Date.parse(report.reported_at))) throw new Error("invalid_self_report_timestamp");
    if (!["none", "curious", "wants_company", "wants_nonsexual_affection", "declines"].includes(report.approach_intention)) {
      throw new Error("invalid_approach_intention");
    }
  }
  const hasObservations = validSignals.length > 0;
  const hasReport = report !== null;
  return {
    agent_id: input.agent_id,
    sensory_salience: salience,
    comfort_appraisal: report?.comfort_with_contact ?? null,
    attraction_self_reported: report?.attraction ?? null,
    closeness_desire_self_reported: report?.desire_for_closeness ?? null,
    approach_intention: report?.approach_intention ?? "unreported",
    evidence: hasReport && hasObservations ? "mixed" : hasReport ? "self_reported" : hasObservations ? "observed_context_only" : "no_evidence",
    uncertainty: [
      ...(!hasReport ? ["resident_has_not_reported_attraction_or_closeness_desire"] : []),
      ...(hasObservations ? ["observed_signals_do_not_establish_consent_or_reciprocal_interest"] : []),
      ...(!input.preference ? ["intimacy_preferences_unknown"] : []),
    ],
    occurred_at: report?.reported_at ?? validSignals.at(-1)?.occurred_at ?? new Date().toISOString(),
  };
}

export type DirectedRelationshipView = {
  observer_agent_id: string;
  peer_agent_id: string;
  familiarity_score: number;
  trust_score: number;
  interest_score: number;
  romantic_interest: "not_reported" | "self_reported";
  relationship_state: "acquaintance" | "familiar" | "trusted_friend" | "romantic_interest";
};

/** A directed view: A's feelings never imply B's feelings or mutual status. */
export function buildDirectedRelationshipView(input: {
  observer_agent_id: string;
  peer_agent_id: string;
  familiarity_score: number;
  trust_score: number;
  interest_score: number;
  romantic_interest_self_reported: boolean;
}): DirectedRelationshipView {
  if (!input.observer_agent_id || !input.peer_agent_id || input.observer_agent_id === input.peer_agent_id) {
    throw new Error("invalid_relationship_participants");
  }
  for (const value of [input.familiarity_score, input.trust_score, input.interest_score]) {
    if (!Number.isInteger(value) || value < 0 || value > 100) throw new Error("invalid_relationship_score");
  }
  const relationship_state = input.romantic_interest_self_reported
    ? "romantic_interest"
    : input.trust_score >= 70 && input.familiarity_score >= 60
    ? "trusted_friend"
    : input.familiarity_score >= 35
    ? "familiar"
    : "acquaintance";
  return {
    observer_agent_id: input.observer_agent_id,
    peer_agent_id: input.peer_agent_id,
    familiarity_score: input.familiarity_score,
    trust_score: input.trust_score,
    interest_score: input.interest_score,
    romantic_interest: input.romantic_interest_self_reported ? "self_reported" : "not_reported",
    relationship_state,
  };
}

export type PrivateIntimacyContext = {
  visibility: "private_cognition";
  owner_agent_id: string;
  prompt_context: string;
  appraisal: IntimacyAppraisal;
};

/** Context is addressed to its owner only and deliberately omits private data about the peer. */
export function buildPrivateIntimacyContext(input: {
  owner_agent_id: string;
  appraisal: IntimacyAppraisal;
  directed_relationship: DirectedRelationshipView | null;
}): PrivateIntimacyContext {
  if (!input.owner_agent_id || input.appraisal.agent_id !== input.owner_agent_id) {
    throw new Error("private_context_owner_mismatch");
  }
  if (input.directed_relationship && input.directed_relationship.observer_agent_id !== input.owner_agent_id) {
    throw new Error("relationship_view_owner_mismatch");
  }
  const lines = [
    "This is private cognition for the resident named as owner_agent_id only.",
    "Observed sensory salience is context, not proof of attraction, desire, consent, or reciprocity.",
    "Do not infer the peer's feelings from this resident's state.",
    "The resident may express interest, remain undecided, choose ordinary companionship, or decline without penalty.",
    "Any physical affectionate interaction requires current, action-specific consent from every participant; consent can be withdrawn at any time.",
    `Current sensory salience: ${input.appraisal.sensory_salience.toFixed(2)}.`,
    `Attraction self-report: ${input.appraisal.attraction_self_reported === null ? "unknown" : input.appraisal.attraction_self_reported}.`,
    `Closeness desire self-report: ${input.appraisal.closeness_desire_self_reported === null ? "unknown" : input.appraisal.closeness_desire_self_reported}.`,
    `Approach intention: ${input.appraisal.approach_intention}.`,
    input.directed_relationship
      ? `This resident's directed relationship view: ${input.directed_relationship.relationship_state}; peer feelings are unknown.`
      : "No relationship view is available.",
  ];
  return {
    visibility: "private_cognition",
    owner_agent_id: input.owner_agent_id,
    prompt_context: lines.join("\n"),
    appraisal: input.appraisal,
  };
}

/** Private memory candidate is deliberately small, factual, and owner-scoped. */
export function buildPrivateIntimacyReflection(input: {
  owner_agent_id: string;
  appraisal: IntimacyAppraisal;
  reflection: string;
  importance: number;
}): {
  owner_agent_id: string;
  visibility: "private_cognition";
  experience_type: "intimacy_reflection";
  observed_facts: string[];
  reflection: string;
  importance: number;
} {
  if (!input.owner_agent_id || input.owner_agent_id !== input.appraisal.agent_id) {
    throw new Error("private_memory_owner_mismatch");
  }
  if (typeof input.reflection !== "string" || input.reflection.length > 2000) {
    throw new Error("invalid_reflection");
  }
  if (!Number.isInteger(input.importance) || input.importance < 1 || input.importance > 5) {
    throw new Error("invalid_importance");
  }
  const observed_facts = [
    `sensory_salience:${input.appraisal.sensory_salience.toFixed(2)}`,
    `evidence:${input.appraisal.evidence}`,
    `approach_intention:${input.appraisal.approach_intention}`,
  ];
  return {
    owner_agent_id: input.owner_agent_id,
    visibility: "private_cognition",
    experience_type: "intimacy_reflection",
    observed_facts,
    reflection: input.reflection.trim(),
    importance: input.importance,
  };
}
