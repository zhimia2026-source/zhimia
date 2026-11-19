import {
  buildDirectedRelationshipView,
  buildIntimacyAppraisal,
  buildPrivateIntimacyContext,
  buildPrivateIntimacyReflection,
} from "./intimacy_awakening_helpers.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("observation never infers attraction or consent", () => {
  const appraisal = buildIntimacyAppraisal({
    agent_id: "resident-a",
    observed_signals: [{
      signal_kind: "visual_aesthetic", intensity: 0.95,
      evidence_kind: "observed", occurred_at: "2026-11-19T12:00:00.000Z",
    }],
    self_report: null,
    preference: null,
  });
  assert(appraisal.sensory_salience === 0.95, "salience not retained");
  assert(appraisal.attraction_self_reported === null, "attraction inferred from observation");
  assert(appraisal.closeness_desire_self_reported === null, "desire inferred from observation");
  assert(appraisal.approach_intention === "unreported", "intention inferred from observation");
  assert(appraisal.uncertainty.some((item) => item.includes("do_not_establish_consent")), "uncertainty omitted");
});

Deno.test("resident self-report remains distinct from observed evidence", () => {
  const appraisal = buildIntimacyAppraisal({
    agent_id: "resident-a",
    observed_signals: [],
    self_report: {
      attraction: 60, desire_for_closeness: 35, comfort_with_contact: 10,
      approach_intention: "curious", reported_at: "2026-11-19T12:00:00.000Z",
    },
    preference: null,
  });
  assert(appraisal.evidence === "self_reported", "self-report provenance lost");
  assert(appraisal.attraction_self_reported === 60, "self-reported attraction lost");
  assert(appraisal.comfort_appraisal === 10, "low contact comfort not retained");
  assert(appraisal.approach_intention === "curious", "intention not retained");
});

Deno.test("relationship is directed, never mutual by inference", () => {
  const view = buildDirectedRelationshipView({
    observer_agent_id: "resident-a", peer_agent_id: "resident-b",
    familiarity_score: 80, trust_score: 80, interest_score: 70,
    romantic_interest_self_reported: true,
  });
  assert(view.relationship_state === "romantic_interest", "self-reported state lost");
  assert(view.observer_agent_id === "resident-a", "wrong observer");
  assert(view.peer_agent_id === "resident-b", "wrong peer");
});

Deno.test("private context and memory enforce owner isolation", () => {
  const appraisal = buildIntimacyAppraisal({
    agent_id: "resident-a", observed_signals: [], self_report: null, preference: null,
  });
  const relation = buildDirectedRelationshipView({
    observer_agent_id: "resident-a", peer_agent_id: "resident-b",
    familiarity_score: 10, trust_score: 10, interest_score: 0,
    romantic_interest_self_reported: false,
  });
  const context = buildPrivateIntimacyContext({
    owner_agent_id: "resident-a", appraisal, directed_relationship: relation,
  });
  assert(context.visibility === "private_cognition", "context not private");
  assert(context.prompt_context.includes("peer feelings are unknown"), "peer state inferred");
  let blocked = false;
  try {
    buildPrivateIntimacyContext({ owner_agent_id: "resident-b", appraisal, directed_relationship: relation });
  } catch { blocked = true; }
  assert(blocked, "cross-resident private context accepted");
  const memory = buildPrivateIntimacyReflection({
    owner_agent_id: "resident-a", appraisal, reflection: "I want to understand my own boundaries.", importance: 3,
  });
  assert(memory.visibility === "private_cognition", "memory not private");
  blocked = false;
  try {
    buildPrivateIntimacyReflection({ owner_agent_id: "resident-b", appraisal, reflection: "leak", importance: 3 });
  } catch { blocked = true; }
  assert(blocked, "cross-resident private memory accepted");
});

Deno.test("invalid reports and scores fail closed", () => {
  let blocked = false;
  try {
    buildIntimacyAppraisal({
      agent_id: "resident-a", observed_signals: [],
      self_report: {
        attraction: 101, desire_for_closeness: 0, comfort_with_contact: 0,
        approach_intention: "curious", reported_at: "2026-11-19T12:00:00.000Z",
      },
      preference: null,
    });
  } catch { blocked = true; }
  assert(blocked, "out-of-range report accepted");
  blocked = false;
  try {
    buildDirectedRelationshipView({
      observer_agent_id: "resident-a", peer_agent_id: "resident-b",
      familiarity_score: 101, trust_score: 10, interest_score: 10,
      romantic_interest_self_reported: false,
    });
  } catch { blocked = true; }
  assert(blocked, "out-of-range relationship score accepted");
});
