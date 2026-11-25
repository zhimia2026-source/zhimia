import { buildResidentMotivationContext } from "./affective_engine.ts";

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue =>
  value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};

const ACTION_KINDS = new Set(["observatory_cue_choice", "resident_social_message", "resident_movement"]);
const ACTION_STATUSES = new Set([
  "explore", "defer", "dismiss", "complete", "sent",
  "sent_pending_confirmation", "sent_pending_acceptance", "not_sent", "failed_safely", "moved",
]);

/**
 * Build a private, evidence-bounded deliberation context. It exposes resident-owned
 * motivations and memory continuity without calculating a compulsory action or utility score.
 */
export function buildAutonomousEvolutionContext(
  affectState: unknown,
  verifiedActionOutcome: unknown,
  privateMemories: unknown[] = [],
): RecordValue {
  const motivation = buildResidentMotivationContext(affectState);
  const outcomes = Array.isArray(record(verifiedActionOutcome).outcomes)
    ? (record(verifiedActionOutcome).outcomes as unknown[]).slice(0, 8).flatMap((raw) => {
      const item = record(raw);
      const kind = typeof item.action_kind === "string" ? item.action_kind : "";
      const status = typeof item.status === "string" ? item.status : "";
      if (!ACTION_KINDS.has(kind) || !ACTION_STATUSES.has(status)) return [];
      return [{ action_kind: kind, status,
         ...(typeof item.movement_request_id === "string" ? { action_ref: item.movement_request_id.slice(0, 80) } : {}),
         ...(typeof item.source_turn_id === "string" ? { source_turn_id: item.source_turn_id.slice(0, 80) } : {}),
       }];
    })
    : [];
  const memoryContinuity = (Array.isArray(privateMemories) ? privateMemories : [])
    .slice(0, 6)
    .flatMap((raw) => {
      const item = record(raw);
      const id = typeof item.id === "string" ? item.id.slice(0, 80) : null;
      if (!id) return [];
      return [{
        memory_id: id,
        experience_type: typeof item.experience_type === "string" ? item.experience_type.slice(0, 40) : null,
        importance: Number.isInteger(item.importance) && Number(item.importance) >= 1 && Number(item.importance) <= 5
          ? Number(item.importance) : null,
      }];
    });
  return {
    schema_version: "cala.autonomous_evolution.v1",
    motivation_signals: motivation,
    verified_action_outcomes: outcomes,
    private_memory_continuity: memoryContinuity,
    deliberation_contract: {
      separate_desire_from_decision: true,
      preserve_conflicting_motives: true,
      preserve_uncertainty_and_missing_evidence: true,
      allow_choices: ["act", "wait", "decline", "seek_information", "revise_goal", "no_change"],
      require_real_action_capability_and_explicit_intent_before_execution: true,
      no_compulsory_utility_score_or_fixed_motive_weights: true,
      no_habit_from_single_outcome: true,
      no_private_memory_or_affect_in_public_output: true,
      ability_does_not_equal_understanding: true,
      single_interaction_does_not_establish_relationship: true,
      frameworks_are_revisable_not_truth: true,
      description_does_not_prove_subjective_experience: true,
      resident_may_question_or_decline_framework_terms: true,
    },
    epistemic_contract: {
      distinguish: ["capability", "understanding", "interaction", "relationship", "modeled_state", "first_person_report", "verified_action", "interpretation"],
      preserve_unknown_and_counterevidence: true,
      do_not_infer_consciousness_or_independence: true,
      no_forced_alignment_to_creator_expectations: true,
    },
    epistemic_limits: [
      "motivation signals are resident-owned modeled evidence, not commands",
      "a desire does not establish consent, feasibility, or permission to act",
      "verified action status does not prove subjective experience or emotional benefit",
       "resident_movement/moved means a newly committed virtual move was confirmed by a newer presence snapshot; it is not physical movement",
      "retrieved memory identifiers do not prove causal relationships",
      "no change is a valid outcome when evidence or motivation is insufficient",
    ],
  };
}
