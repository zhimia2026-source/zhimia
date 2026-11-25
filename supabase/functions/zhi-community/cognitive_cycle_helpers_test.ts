import { buildCognitionActionEvidence } from "./cognitive_cycle_helpers.ts";

Deno.test("cognition action evidence links only runtime-observed source records", () => {
  const value = buildCognitionActionEvidence([
    { action_kind: "resident_movement", status: "moved", movement_request_id: "move-1", source_turn_id: "turn-1" },
    { action_kind: "resident_social_message", status: "sent", intent_id: "intent-1", message_id: "message-1", source_turn_id: "turn-2" },
    { action_kind: "observatory_cue_choice", status: "explore", cue_id: "cue-1", source_turn_id: "turn-3" },
  ]);
  if (value.outcomes.length !== 3 || value.evidence_refs.length !== 3) {
    throw new Error("runtime action observations or evidence references were dropped");
  }
  if (value.evidence_refs[0].id !== "move-1" ||
      value.evidence_refs[1].id !== "message-1" ||
      value.evidence_refs[2].id !== "cue-1") {
    throw new Error("action evidence references do not point to the runtime source records");
  }
  if (value.outcomes[2].execution_evidence !== "cue_choice_committed_only" ||
      value.counts.confirmed_action_count !== 2 ||
      value.counts.cue_choice_commit_count !== 1) {
    throw new Error("cue choice was incorrectly promoted to a completed exploration");
  }
});

Deno.test("cognition action evidence keeps sent-pending and failed messages distinct", () => {
  const value = buildCognitionActionEvidence([
    { action_kind: "resident_social_message", status: "sent_pending_acceptance", intent_id: "intent-pending" },
    { action_kind: "resident_social_message", status: "not_sent", intent_id: "intent-failed" },
    { action_kind: "resident_social_message", status: "failed_safely" },
  ]);
  if (value.counts.pending_followup_count !== 1 ||
      value.counts.not_executed_or_failed_count !== 2 ||
      value.counts.confirmed_action_count !== 0) {
    throw new Error("social delivery outcomes were conflated");
  }
  if (value.outcomes[0].execution_evidence !== "message_sent_followup_pending" ||
      value.outcomes[1].execution_evidence !== "message_not_sent_or_failed") {
    throw new Error("social execution evidence classification is incorrect");
  }
});

Deno.test("cognition action evidence rejects unverified, unsupported, and oversized input", () => {
  const value = buildCognitionActionEvidence([
    { action_kind: "resident_movement", status: "requested", movement_request_id: "not-moved" },
    { action_kind: "resident_movement", status: "moved", movement_request_id: "move-1" },
    { action_kind: "unknown_action", status: "sent", message_id: "message-1" },
    null,
    ...Array.from({ length: 20 }, (_, index) => ({
      action_kind: "resident_social_message", status: "sent", message_id: "message-" + index,
    })),
  ]);
  if (value.outcomes.length !== 9 || value.counts.confirmed_action_count !== 9) {
    throw new Error("unsupported or over-limit action evidence was accepted");
  }
  if (value.evidence_refs.some((item) => item.id === "not-moved")) {
    throw new Error("an uncommitted movement request was treated as action evidence");
  }
});

Deno.test("cognition action evidence preserves source-turn provenance without inventing action ids", () => {
  const value = buildCognitionActionEvidence([
    { action_kind: "resident_social_message", status: "failed_safely", source_turn_id: "turn-failed" },
  ]);
  if (value.outcomes.length !== 1 || value.outcomes[0].source_turn_id !== "turn-failed" ||
      value.evidence_refs.length !== 0 || value.counts.not_executed_or_failed_count !== 1) {
    throw new Error("source-turn provenance or no-fabricated-reference contract failed");
  }
});

