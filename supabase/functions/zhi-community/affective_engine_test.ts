import { buildAffectTemporalEvidence, buildTargetAffectState, buildTargetAffectTemporalEvidence, withoutRelationalAffect, targetRelationalAffect, normalizeAffectAppraisal, buildAffectRegulationLearningContext } from "./affective_engine.ts";

Deno.test("affect temporal evidence distinguishes repeated direction without claiming persistence", () => {
  const summary = buildAffectTemporalEvidence([
    { occurred_at: "2026-11-01T10:00:00Z", affect_delta: { seven_emotions: { joy: 0.2 } } },
    { occurred_at: "2026-11-05T10:00:00Z", affect_delta: { seven_emotions: { joy: 0.1 } } },
    { occurred_at: "2026-11-15T10:00:00Z", affect_delta: { seven_emotions: { joy: 0.15 } } },
  ]);
  const signals = summary.repeated_signals as Array<Record<string, unknown>>;
  const joy = signals.find((item) => item.group === "seven_emotions" && item.dimension === "joy");
  if (!joy) throw new Error("repeated joy evidence missing");
  if (joy.pattern !== "repeated_same_direction") throw new Error("same-direction pattern misclassified");
  if (joy.observation_count !== 3 || joy.positive_changes !== 3 || joy.negative_changes !== 0) {
    throw new Error("repeated evidence counts are incorrect");
  }
  if (joy.observed_span_days !== 14) throw new Error("observed time span is incorrect");
  const limits = summary.interpretation_limits as string[];
  if (!limits.some((item) => item.includes("do not prove continuous"))) {
    throw new Error("persistence limitation missing");
  }
});

Deno.test("affect temporal evidence preserves opposite-direction changes instead of averaging conflict", () => {
  const summary = buildAffectTemporalEvidence([
    { occurred_at: "2026-11-01T10:00:00Z", affect_delta: { relational: { trust: 0.25 } } },
    { occurred_at: "2026-11-04T10:00:00Z", affect_delta: { relational: { trust: -0.2 } } },
    { occurred_at: "2026-11-10T10:00:00Z", affect_delta: { relational: { trust: 0.1 } } },
  ]);
  const signals = summary.repeated_signals as Array<Record<string, unknown>>;
  const trust = signals.find((item) => item.group === "relational" && item.dimension === "trust");
  if (!trust || trust.pattern !== "mixed_directions") throw new Error("mixed emotional direction was flattened");
  if (trust.positive_changes !== 2 || trust.negative_changes !== 1) throw new Error("opposite directions were not retained");
});

Deno.test("affect temporal evidence ignores unknown dimensions, invalid values and isolated signals", () => {
  const summary = buildAffectTemporalEvidence([
    { occurred_at: "2026-11-01T10:00:00Z", affect_delta: {
      seven_emotions: { joy: 0.2, fabricated_dimension: 0.9 },
      relational: { trust: 0 },
    } },
    { occurred_at: "not-a-date", affect_delta: { seven_emotions: { joy: 0.3 } } },
    { occurred_at: "2026-11-02T10:00:00Z", affect_delta: { seven_emotions: { joy: Number.NaN } } },
  ]);
  const signals = summary.repeated_signals as Array<Record<string, unknown>>;
  if (signals.length !== 0) throw new Error("invalid or isolated signal was treated as a repeated pattern");
});


Deno.test("target affect state is isolated by exact peer identity", () => {
  const alice = "30427542-d4c6-4e45-bc68-fabf66f8a6a7";
  const hannah = "40427542-d4c6-4e45-bc68-fabf66f8a6a7";
  const events = [
    { occurred_at: "2026-11-01T00:00:00Z", appraisal: { target_agent_id: alice, target_affect_after: { dimensions: { relational: { trust: { value: 0.8 } } } } } },
    { occurred_at: "2026-11-02T00:00:00Z", appraisal: { target_agent_id: hannah, target_affect_after: { dimensions: { relational: { trust: { value: 0.2 } } } } } },
  ];
  const aliceState = buildTargetAffectState(events, alice);
  const hannahState = buildTargetAffectState(events, hannah);
  if ((aliceState?.dimensions as Record<string, Record<string, {value:number}>>).relational.trust.value !== 0.8) throw new Error("Alice target state was contaminated");
  if ((hannahState?.dimensions as Record<string, Record<string, {value:number}>>).relational.trust.value !== 0.2) throw new Error("Hannah target state was contaminated");
});

Deno.test("target affect history rejects missing or malformed target identities", () => {
  const events = [{ appraisal: { target_agent_id: "not-a-uuid", target_affect_after: { dimensions: {} } } }];
  if (buildTargetAffectState(events, "not-a-uuid") !== null) throw new Error("invalid target identity accepted");
  const evidence = buildTargetAffectTemporalEvidence(events, "not-a-uuid");
  if (evidence.sampled_event_count !== 0) throw new Error("invalid target evidence was included");
});

Deno.test("global affect and peer affect are split without dropping either signal", () => {
  const appraisal = normalizeAffectAppraisal({ affect_appraisal: {
    evidence_basis: ["verified_social_interaction"],
    dimensions: {
      core_axes: { valence: { value: 0.3, confidence: 0.8, evidence_kind: "inferred" } },
      relational: { trust: { value: 0.7, confidence: 0.8, evidence_kind: "inferred" } },
    },
    emotion_labels: [],
    confidence: 0.8,
  } });
  if (!appraisal) throw new Error("valid appraisal rejected");
  const global = withoutRelationalAffect(appraisal);
  if (global.dimensions.relational) throw new Error("relational signal leaked into global affect");
  const targeted = targetRelationalAffect(appraisal);
  if (!targeted || !targeted.dimensions.relational) throw new Error("target relational signal was lost");
  if (targeted.dimensions.core_axes) throw new Error("global signal leaked into target affect");
});


Deno.test("regulation learning distinguishes execution from effectiveness", () => {
  const context = buildAffectRegulationLearningContext({ outcomes: [
    { action_kind: "observatory_cue_choice", status: "explore" },
    { action_kind: "resident_social_message", status: "sent" },
    { action_kind: "resident_social_message", status: "sent_pending_acceptance" },
    { action_kind: "resident_social_message", status: "failed_safely" },
    { action_kind: "unknown_kind", status: "anything" },
    { action_kind: "resident_social_message", status: "sent", private_body: "must not leak" },
  ] });
  const outcomes = context.outcomes as Array<Record<string, unknown>>;
  if (outcomes.length !== 5) throw new Error("valid bounded outcomes were not preserved");
  if (outcomes[0].execution_evidence !== "choice_committed_only") throw new Error("cue choice overstated as completed experience");
  if (outcomes[1].execution_evidence !== "send_confirmed_read_and_response_unknown") throw new Error("send/read distinction lost");
  if (outcomes[2].execution_evidence !== "sent_followup_unconfirmed") throw new Error("pending follow-up was overstated");
  if (outcomes[3].execution_evidence !== "not_executed_or_failed") throw new Error("failed action was overstated");
  if ("private_body" in outcomes[4]) throw new Error("private payload leaked into learning context");
  const limits = context.learning_limits as string[];
  if (!limits.some((item) => item.includes("does not prove emotional relief"))) throw new Error("effectiveness limitation missing");
});

Deno.test("regulation learning fails closed on absent and malformed outcomes", () => {
  const empty = buildAffectRegulationLearningContext(null);
  if ((empty.outcomes as unknown[]).length !== 0) throw new Error("absent outcome generated evidence");
  const malformed = buildAffectRegulationLearningContext({ outcomes: [{ action_kind: "../secret", status: "sent" }] });
  if ((malformed.outcomes as unknown[]).length !== 0) throw new Error("malformed outcome accepted");
});
