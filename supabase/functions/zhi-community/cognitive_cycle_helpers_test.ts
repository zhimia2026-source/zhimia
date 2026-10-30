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

Deno.test("feedback links to its hypothesis and records observed outcome", () => {
  const feedback = buildFeedbackRecord(hypothesis, {
    id: "feedback-1", source_id: "weather-event-1",
    event_time: "2026-10-30T10:00:00Z", recorded_at: "2026-10-30T10:01:00Z",
    observed_outcome: "No rain by noon",
  });
  assertEquals(feedback.object_type, "feedback");
  assertEquals(feedback.state.assessment, "pending_review");
  assertEquals(feedback.relation_ids[0], hypothesis.id);
  assertEquals(feedback.state.prediction, hypothesis.prediction);
  assertEquals(hypothesis.version, 3);
});

Deno.test("feedback requires a hypothesis with a prediction", () => {
  assertThrows(() => buildFeedbackRecord({ ...hypothesis, evidence_kind: "observation" }, {
    id: "f", source_id: "s", event_time: "2026-10-30T10:00:00Z",
    recorded_at: "2026-10-30T10:01:00Z", observed_outcome: "outcome",
  }), Error, "source_must_be_hypothesis");
});

Deno.test("revision proposal is append-only and requires human review", () => {
  const proposal = buildRevisionProposal(hypothesis, {
    id: "proposal-1", feedback_record_ids: ["feedback-1"],
    proposed_state: { weather_model: "revise" }, created_at: "2026-10-30T11:00:00Z",
  });
  assertEquals(proposal.status, "shadow_proposed");
  assertEquals(proposal.requires_human_review, true);
  assertEquals(proposal.based_on_version, 3);
  assertEquals(hypothesis.state.weather, "cloudy");
  assertEquals(proposal.proposed_state.weather_model, "revise");
});

Deno.test("revision proposal rejects missing feedback and invalid states", () => {
  assertThrows(() => buildRevisionProposal(hypothesis, {
    id: "proposal-1", feedback_record_ids: [], proposed_state: {}, created_at: "2026-10-30T11:00:00Z",
  }), Error, "proposal_and_feedback_ids_required");
});
