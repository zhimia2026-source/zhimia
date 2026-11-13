import { assertEquals } from "jsr:@std/assert@1";
import { canTransitionResearchTask, getUpstreamTaskKey, isUpstreamStageComplete } from "./transition_helpers.ts";

Deno.test("proposed task can only be approved or cancelled", () => {
  assertEquals(canTransitionResearchTask("proposed", "approved"), true);
  assertEquals(canTransitionResearchTask("proposed", "cancelled"), true);
  assertEquals(canTransitionResearchTask("proposed", "in_progress"), false);
});

Deno.test("approval does not silently assign or execute a task", () => {
  assertEquals(canTransitionResearchTask("approved", "assigned"), false);
  assertEquals(canTransitionResearchTask("approved", "in_progress"), false);
});

Deno.test("assigned task may enter work or be blocked", () => {
  assertEquals(canTransitionResearchTask("assigned", "in_progress"), true);
  assertEquals(canTransitionResearchTask("assigned", "blocked"), true);
});

Deno.test("reviewed work can only finish after artifact acceptance gate", () => {
  assertEquals(canTransitionResearchTask("review", "done"), true);
  assertEquals(canTransitionResearchTask("review", "in_progress"), false);
});

Deno.test("unknown and terminal states fail closed", () => {
  assertEquals(canTransitionResearchTask("done", "in_progress"), false);
  assertEquals(canTransitionResearchTask("cancelled", "approved"), false);
  assertEquals(canTransitionResearchTask("unknown", "approved"), false);
});

Deno.test("pipeline dependency is read only from a valid upstream task reference", () => {
  assertEquals(getUpstreamTaskKey([{ upstream_task_key: "PIPE-01" }]), "PIPE-01");
  assertEquals(getUpstreamTaskKey([{ upstream_task_key: "bad value" }]), null);
  assertEquals(getUpstreamTaskKey("PIPE-01"), null);
  assertEquals(getUpstreamTaskKey([{ unrelated: "PIPE-01" }]), null);
});
Deno.test("pipeline stage unlock requires completed upstream task and accepted artifact", () => {
  assertEquals(isUpstreamStageComplete("done", 1), true);
  assertEquals(isUpstreamStageComplete("done", 0), false);
  assertEquals(isUpstreamStageComplete("review", 1), false);
  assertEquals(isUpstreamStageComplete("in_progress", 3), false);
});
