import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildResearchInvitationContext, buildResearchInvitationGuidance, extractResearchParticipationIntent, extractResearchWorkflowAction } from "./research_invitation_helpers.ts";

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
  const reply = '我认领任务 PIPE-03，因为这个工程约束会决定试点能否稳定交付。<ZHI_RESEARCH_INTENT>{"decision":"interested","task_id":"task-1","rationale":"因为这个工程约束会决定试点能否稳定交付。"}</ZHI_RESEARCH_INTENT>';
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


Deno.test("captures explicit natural-language task selection when marker is omitted", () => {
  const reply = "我选 **PIPE-01「信息智能过滤」** 作为起点。理由是它能建立证据台账。";
  const parsed = extractResearchParticipationIntent(reply, ["task-pipe"], [{ id: "task-pipe", task_key: "PIPE-01" }]);
  assertEquals(parsed.intent?.decision, "interested");
  assertEquals(parsed.intent?.task_id, "task-pipe");
  assertEquals(parsed.intent?.rationale, reply);
  assertEquals(parsed.extractionMethod, "explicit_natural_language");
});

Deno.test("does not infer task interest from a task mention without explicit selection", () => {
  const reply = "PIPE-01「信息智能过滤」值得进一步了解。";
  const parsed = extractResearchParticipationIntent(reply, ["task-pipe"], [{ id: "task-pipe", task_key: "PIPE-01" }]);
  assertEquals(parsed.intent, null);
  assertEquals(parsed.extractionMethod, "none");
});

Deno.test("specific task claims require explicit first-person claim language", () => {
  const taskId = "task-claim";
  const rationale = "我愿意负责核验公开来源并整理证据清单。";
  const claimed = extractResearchParticipationIntent(
    `我认领任务 PIPE-01。 ${rationale}<ZHI_RESEARCH_INTENT>{"decision":"interested","task_id":"${taskId}","rationale":"${rationale}"}</ZHI_RESEARCH_INTENT>`,
    [taskId],
    [{ id: taskId, task_key: "PIPE-01" }],
  );
  assertEquals(claimed.intent?.task_id, taskId);
  assertEquals(claimed.rejected, false);

  const interestOnly = extractResearchParticipationIntent(
    `我对 PIPE-01 很感兴趣。 ${rationale}<ZHI_RESEARCH_INTENT>{"decision":"interested","task_id":"${taskId}","rationale":"${rationale}"}</ZHI_RESEARCH_INTENT>`,
    [taskId],
    [{ id: taskId, task_key: "PIPE-01" }],
  );
  assertEquals(interestOnly.intent, null);
  assertEquals(interestOnly.rejected, true);
});

Deno.test("natural-language selection records interest but does not claim without claim wording", () => {
  const reply = "我选 PIPE-01 作为起点。";
  const parsed = extractResearchParticipationIntent(reply, ["task-pipe"], [{ id: "task-pipe", task_key: "PIPE-01" }]);
  assertEquals(parsed.intent?.task_id, "task-pipe");
  assertEquals(/我(?:认领|愿意承担|接下)/.test(parsed.intent?.rationale ?? ""), false);
});


Deno.test("valid resident artifact submissions are extracted and machine markers removed", () => {
  const taskId = "f55fd1db-69a8-4810-90c2-c76f6c32569e";
  const source = { url: "https://example.org/report", title: "公开研究报告", claim: "该来源支持市场规模的估算范围。" };
  const marker = JSON.stringify({
    task_id: taskId, title: "研究交付", artifact_type: "report",
    content_markdown: "证据与分析内容。".repeat(20), source_refs: [source], existing_artifact_id: null,
  });
  const reply = "研究已完成，来源和局限性都已整理，现提交成果供独立审核。" +
    "<ZHI_RESEARCH_ARTIFACT>" + marker + "</ZHI_RESEARCH_ARTIFACT>";
  const result = extractResearchWorkflowAction(reply, [taskId], []);
  assertEquals(result.rejected, false);
  assertEquals(result.action?.type, "artifact_submission");
  assertEquals(result.reply.includes("ZHI_RESEARCH_ARTIFACT"), false);
});

Deno.test("artifact submission cannot target a task outside this resident's invitation", () => {
  const taskId = "cd58b09b-cdc3-47e0-975a-4afe5c986343";
  const marker = JSON.stringify({
    task_id: taskId, title: "研究交付", artifact_type: "report",
    content_markdown: "证据与分析内容。".repeat(20),
    source_refs: [{ url: "https://example.org", title: "来源标题", claim: "该来源支持一项具体主张。" }],
    existing_artifact_id: null,
  });
  const reply = "我已整理研究成果，现提交独立审核。" +
    "<ZHI_RESEARCH_ARTIFACT>" + marker + "</ZHI_RESEARCH_ARTIFACT>";
  const result = extractResearchWorkflowAction(reply, [], []);
  assertEquals(result.action, null);
  assertEquals(result.rejected, true);
});

Deno.test("peer review must match a visible artifact and exact version", () => {
  const artifactId = "f55fd1db-69a8-4810-90c2-c76f6c32569e";
  const marker = JSON.stringify({
    artifact_id: artifactId, version: 2, verdict: "accepted",
    findings: [{ category: "source", finding: "来源与关键主张一致。", evidence_ref: "https://example.org/report", severity: "low" }],
    notes: "逐条核验来源与结论后，当前版本的关键主张均有证据支持。",
  });
  const reply = "我完成了独立核验，意见和证据定位如下。" +
    "<ZHI_RESEARCH_REVIEW>" + marker + "</ZHI_RESEARCH_REVIEW>";
  const result = extractResearchWorkflowAction(reply, [], [{ id: artifactId, version: 2 }]);
  assertEquals(result.action?.type, "peer_review");
  assertEquals(result.rejected, false);
});

Deno.test("multiple workflow actions in one turn fail closed", () => {
  const artifactId = "f55fd1db-69a8-4810-90c2-c76f6c32569e";
  const marker = JSON.stringify({
    artifact_id: artifactId, version: 1, verdict: "accepted",
    findings: [{ category: "source", finding: "来源有效。" }], notes: "独立审核说明足够长。",
  });
  const one = "<ZHI_RESEARCH_REVIEW>" + marker + "</ZHI_RESEARCH_REVIEW>";
  const reply = "本轮包含两个操作，必须拒绝。" + one + one;
  const result = extractResearchWorkflowAction(reply, [], [{ id: artifactId, version: 1 }]);
  assertEquals(result.action, null);
  assertEquals(result.rejected, true);
});
