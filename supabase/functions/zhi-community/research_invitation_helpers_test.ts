import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildResearchInvitationContext, buildResearchInvitationGuidance, extractResearchParticipationIntent } from "./research_invitation_helpers.ts";

Deno.test("only requested residents receive voluntary invitation context", () => {
  const tasks = [{ id: "task-1", task_key: "PIPE-03", title: "Engineering limits", task_type: "analysis", priority: "high", status: "approved", assigned_agent_id: "agent-1", acceptance_criteria: ["evidence"] }];
  const context = buildResearchInvitationContext({ agentId: "agent-1", residentName: "Elon", participationStatus: "requested", tasks });
  assertEquals(context.includes("PIPE-03"), true);
  assertEquals(context.includes('"participation_is_not_consent":true'), true);
  assertEquals(context.includes("designated_resident_pending_assignment_transition"), true);
  assertEquals(buildResearchInvitationContext({ agentId: "agent-1", residentName: "Elon", participationStatus: "declined", tasks }), "");
});

Deno.test("does not expose tasks assigned to another resident or inactive tasks", () => {
  const context = buildResearchInvitationContext({ agentId: "agent-1", residentName: "Resident", participationStatus: "requested", tasks: [
    { id: "other", task_key: "PIPE-02", title: "Other", task_type: "analysis", priority: "normal", status: "assigned", assigned_agent_id: "agent-2" },
    { id: "blocked", task_key: "PIPE-04", title: "Blocked", task_type: "analysis", priority: "normal", status: "blocked" },
  ] });
  assertEquals(context, "");
  assertEquals(buildResearchInvitationGuidance(""), "");
});

Deno.test("records only an explicit decision tied to visible rationale and invited task", () => {
  const reply = '我愿意研究 PIPE-03，因为这个工程约束会决定试点能否稳定交付。<ZHI_RESEARCH_INTENT>{"decision":"interested","task_id":"task-1","rationale":"因为这个工程约束会决定试点能否稳定交付。"}</ZHI_RESEARCH_INTENT>';
  const parsed = extractResearchParticipationIntent(reply, ["task-1"]);
  assertEquals(parsed.intent?.decision, "interested");
  assertEquals(parsed.intent?.task_id, "task-1");
  assertEquals(parsed.reply.includes("ZHI_RESEARCH_INTENT"), false);
  assertEquals(parsed.rejected, false);
});

Deno.test("rejects task spoofing, implicit consent, and invisible rationale", () => {
  const spoofed = extractResearchParticipationIntent('我愿意。<ZHI_RESEARCH_INTENT>{"decision":"interested","task_id":"other-task","rationale":"我愿意参与这项工作并承担责任。"}</ZHI_RESEARCH_INTENT>', ["task-1"]);
  assertEquals(spoofed.intent, null);
  assertEquals(spoofed.rejected, true);
  const noVisibleRationale = extractResearchParticipationIntent('我考虑一下。<ZHI_RESEARCH_INTENT>{"decision":"interested","task_id":"task-1","rationale":"我愿意参与这项工作并承担责任。"}</ZHI_RESEARCH_INTENT>', ["task-1"]);
  assertEquals(noVisibleRationale.intent, null);
  assertEquals(noVisibleRationale.rejected, true);
  const malformedTask = extractResearchParticipationIntent('我愿意。<ZHI_RESEARCH_INTENT>{"decision":"interested","rationale":"我愿意参与这项工作并承担责任。"}</ZHI_RESEARCH_INTENT>', ["task-1"]);
  assertEquals(malformedTask.intent, null);
  assertEquals(malformedTask.rejected, true);
});

Deno.test("records broad direction-level interest without inventing a task selection", () => {
  const reply = '我个人对信息架构和价值验证这两个研究方向有兴趣。<ZHI_RESEARCH_INTENT>{"decision":"interested","task_id":null,"rationale":"我个人对信息架构和价值验证这两个研究方向有兴趣。"}</ZHI_RESEARCH_INTENT>';
  const parsed = extractResearchParticipationIntent(reply, ["task-1", "task-2"]);
  assertEquals(parsed.intent?.decision, "interested");
  assertEquals(parsed.intent?.task_id, null);
  assertEquals(parsed.intent?.rationale, "我个人对信息架构和价值验证这两个研究方向有兴趣。");
  assertEquals(parsed.rejected, false);
  assertEquals(parsed.reply.includes("ZHI_RESEARCH_INTENT"), false);
});
