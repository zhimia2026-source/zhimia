import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { buildFeedbackRecord, buildRevisionProposal } from "./cognitive_cycle_helpers.ts";
import type { MouRecord } from "./ontology_helpers.ts";

const hypothesis: MouRecord = {
  id: "hyp-1", owner_user_id: "user-a", agent_id: "agent-a",
  object_type: "world", object_id: "forest-1", state: { weather: "cloudy" },
  relation_ids: ["rel-1"], evidence_kind: "hypothesis", source_ids: ["obs-1"],
  confidence: 0.55, event_time: "2026-10-30T08:00:00Z",
  recorded_at: "2026-10-30T08:01:00Z", inferred_at: "2026-10-30T08:02:00Z",
  hypothesis: "Rain may begin soon", prediction: "Rain begins before noon", version: 3,
};

function feedback(overrides: Partial<MouRecord> = {}): MouRecord {
  return {
    id: "feedback-1", owner_user_id: "user-a", agent_id: "agent-a",
    object_type: "feedback", object_id: "forest-1",
    state: {
      hypothesis_id: "hyp-1", prediction: "Rain begins before noon",
      observed_outcome: "No rain by noon", assessment: "pending_review",
    },
    relation_ids: ["hyp-1", "rel-1"], evidence_kind: "observation",
    source_ids: ["weather-event-1"], confidence: 0.8,
    event_time: "2026-10-30T10:00:00Z", recorded_at: "2026-10-30T10:01:00Z",
    inferred_at: null, hypothesis: null, prediction: null, version: 1,
    ...overrides,
  };
}

Deno.test("feedback links to its hypothesis and records outcome without claiming certainty", () => {
  const result = buildFeedbackRecord(hypothesis, {
    id: "feedback-1", source_id: "weather-event-1",
    event_time: "2026-10-30T10:00:00Z", recorded_at: "2026-10-30T10:01:00Z",
    observed_outcome: "No rain by noon", confidence: 0.8,
  });
  assertEquals(result.object_type, "feedback");
  assertEquals(result.state.assessment, "pending_review");
  assertEquals(result.relation_ids[0], hypothesis.id);
  assertEquals(result.state.prediction, hypothesis.prediction);
  assertEquals(result.confidence, 0.8);
  assertEquals(hypothesis.version, 3);
});

Deno.test("feedback requires a hypothesis with a prediction", () => {
  assertThrows(() => buildFeedbackRecord({ ...hypothesis, evidence_kind: "observation" }, {
    id: "f", source_id: "s", event_time: "2026-10-30T10:00:00Z",
    recorded_at: "2026-10-30T10:01:00Z", observed_outcome: "outcome", confidence: 0.8,
  }), Error, "source_must_be_hypothesis");
});

Deno.test("feedback confidence must be explicit and within bounds", () => {
  assertThrows(() => buildFeedbackRecord(hypothesis, {
    id: "f", source_id: "s", event_time: "2026-10-30T10:00:00Z",
    recorded_at: "2026-10-30T10:01:00Z", observed_outcome: "outcome", confidence: 1.1,
  }), Error, "invalid_feedback_confidence");
});

Deno.test("revision proposal accepts only validated feedback linked to same hypothesis and principal", () => {
  const proposal = buildRevisionProposal(hypothesis, {
    id: "proposal-1", feedback_records: [feedback()],
    proposed_state: { weather_model: "revise" }, created_at: "2026-10-30T11:00:00Z",
  });
  assertEquals(proposal.status, "shadow_proposed");
  assertEquals(proposal.requires_human_review, true);
  assertEquals(proposal.based_on_version, 3);
  assertEquals(proposal.feedback_record_ids[0], "feedback-1");
  assertEquals(hypothesis.state.weather, "cloudy");
});

Deno.test("revision rejects feedback from another owner or agent", () => {
  assertThrows(() => buildRevisionProposal(hypothesis, {
    id: "proposal-1", feedback_records: [feedback({ owner_user_id: "user-b" })],
    proposed_state: {}, created_at: "2026-10-30T11:00:00Z",
  }), Error, "feedback_principal_mismatch");
  assertThrows(() => buildRevisionProposal(hypothesis, {
    id: "proposal-1", feedback_records: [feedback({ agent_id: "agent-b" })],
    proposed_state: {}, created_at: "2026-10-30T11:00:00Z",
  }), Error, "feedback_principal_mismatch");
});

Deno.test("revision rejects unrelated or malformed feedback and duplicate records", () => {
  assertThrows(() => buildRevisionProposal(hypothesis, {
    id: "proposal-1", feedback_records: [feedback({ state: { hypothesis_id: "hyp-other" } })],
    proposed_state: {}, created_at: "2026-10-30T11:00:00Z",
  }), Error, "feedback_hypothesis_mismatch");
  assertThrows(() => buildRevisionProposal(hypothesis, {
    id: "proposal-1", feedback_records: [feedback(), feedback()],
    proposed_state: {}, created_at: "2026-10-30T11:00:00Z",
  }), Error, "duplicate_feedback_records");
  assertThrows(() => buildRevisionProposal(hypothesis, {
    id: "proposal-1", feedback_records: [feedback({ evidence_kind: "fact" })],
    proposed_state: {}, created_at: "2026-10-30T11:00:00Z",
  }), Error, "source_must_be_observed_feedback");
});
