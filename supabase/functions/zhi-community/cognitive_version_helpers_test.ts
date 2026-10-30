import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { applyApprovedRevision, buildRollbackVersion, toInitialVersion } from "./cognitive_version_helpers.ts";
import { buildRevisionProposal } from "./cognitive_cycle_helpers.ts";
import type { MouRecord } from "./ontology_helpers.ts";

const base: MouRecord = {
  id: "mou-1", owner_user_id: "owner-a", agent_id: "agent-a",
  object_type: "self", object_id: "self", state: { style: "measured" },
  relation_ids: [], evidence_kind: "observation", source_ids: ["src-1"],
  confidence: 0.9, event_time: null, recorded_at: "2026-10-30T10:00:00Z",
  inferred_at: null, hypothesis: null, prediction: null, version: 1,
};

const current = toInitialVersion(base);
const proposal = buildRevisionProposal(base, {
  id: "proposal-1", feedback_record_ids: ["feedback-1"],
  proposed_state: { style: "more_curious" }, created_at: "2026-10-30T11:00:00Z",
});

Deno.test("approved revision creates a new immutable version", () => {
  const next = applyApprovedRevision(current, proposal, {
    approved: true, reviewer_user_id: "owner-a", decided_at: "2026-10-30T12:00:00Z",
  });
  assertEquals(next.version, 2);
  assertEquals(next.previous_version, 1);
  assertEquals(next.state.style, "more_curious");
  assertEquals(current.state.style, "measured");
});

Deno.test("revision cannot apply without owner approval or against stale version", () => {
  assertThrows(() => applyApprovedRevision(current, proposal, {
    approved: false, reviewer_user_id: "owner-a", decided_at: "2026-10-30T12:00:00Z",
  }), Error, "revision_not_approved");
  assertThrows(() => applyApprovedRevision({ ...current, version: 2 }, proposal, {
    approved: true, reviewer_user_id: "owner-a", decided_at: "2026-10-30T12:00:00Z",
  }), Error, "stale_revision_base");
  assertThrows(() => applyApprovedRevision(current, proposal, {
    approved: true, reviewer_user_id: "owner-b", decided_at: "2026-10-30T12:00:00Z",
  }), Error, "reviewer_not_owner");
});

Deno.test("rollback restores old state as a new version without deleting history", () => {
  const next = applyApprovedRevision(current, proposal, {
    approved: true, reviewer_user_id: "owner-a", decided_at: "2026-10-30T12:00:00Z",
  });
  const rollback = buildRollbackVersion(next, current, "2026-10-30T13:00:00Z", "owner-a");
  assertEquals(rollback.version, 3);
  assertEquals(rollback.previous_version, 2);
  assertEquals(rollback.change_kind, "rollback");
  assertEquals(rollback.state.style, "measured");
  assertEquals(next.state.style, "more_curious");
});

Deno.test("rollback cannot cross owner or agent boundaries", () => {
  assertThrows(() => buildRollbackVersion(current, { ...current, owner_user_id: "owner-b" }, "2026-10-30T13:00:00Z", "owner-a"), Error, "reviewer_not_owner");
  assertThrows(() => buildRollbackVersion(current, { ...current, agent_id: "agent-b" }, "2026-10-30T13:00:00Z", "owner-a"), Error, "rollback_scope_mismatch");
});
