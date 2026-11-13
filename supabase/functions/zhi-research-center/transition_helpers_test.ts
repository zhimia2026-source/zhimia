import { assertEquals } from "jsr:@std/assert@1";
import { canTransitionResearchTask, canClaimResearchTask, canSubmitResearchArtifact, canReviewResearchArtifact, canCompleteResearchTask, canRequestRework, getUpstreamTaskKey, isUpstreamStageComplete, validateStageArtifact } from "./transition_helpers.ts";

Deno.test("proposed task can only be approved or cancelled", () => {
  assertEquals(canTransitionResearchTask("proposed", "approved"), true);
  assertEquals(canTransitionResearchTask("proposed", "cancelled"), true);
  assertEquals(canTransitionResearchTask("proposed", "in_progress"), false);
});

Deno.test("approval does not silently assign or execute a task", () => {
  assertEquals(canTransitionResearchTask("approved", "assigned"), false);
  assertEquals(canTransitionResearchTask("approved", "in_progress"), false);
});

Deno.test("assigned task must be claimed before work starts", () => {
  assertEquals(canTransitionResearchTask("assigned", "claimed"), true);
  assertEquals(canTransitionResearchTask("assigned", "in_progress"), false);
  assertEquals(canTransitionResearchTask("claimed", "in_progress"), true);
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


Deno.test("Elon stage artifact requires measurable, reproducible, repairable engineering evidence", () => {
  const missing = validateStageArtifact("PIPE-03", "方案说明：采用新技术");
  assertEquals(missing.includes("baseline_metric"), true);
  assertEquals(missing.includes("repair_procedure"), true);
  assertEquals(missing.includes("rollback_plan"), true);
  const complete = [
    "基线指标：当前人工处理时间", "目标值：降低30%", "测量方法：记录每单时间",
    "可复现实验：按步骤运行", "故障模式：接口超时", "修复步骤：重试并恢复",
    "回滚：恢复旧流程", "恢复时间目标：RTO 2小时", "运维成本：每月成本",
  ].join("\n");
  assertEquals(validateStageArtifact("PIPE-03", complete), []);
});

Deno.test("Jensen stage artifact requires an economically testable cash-flow loop", () => {
  const missing = validateStageArtifact("PIPE-04", "平台扩张与伙伴生态");
  assertEquals(missing.includes("willingness_to_pay"), true);
  assertEquals(missing.includes("cash_flow"), true);
  assertEquals(missing.includes("gross_margin"), true);
  const complete = [
    "付费客户：新加坡 SME", "付费意愿：愿意支付月费", "收入模式：订阅定价",
    "成本结构：直接交付成本", "毛利率：目标毛利", "现金流：回款周期",
    "盈亏平衡：预计回本周期", "边际成本：规模化后下降", "伙伴收益：合作伙伴分成",
  ].join("\n");
  assertEquals(validateStageArtifact("PIPE-04", complete), []);
});


Deno.test("stage acceptance rejects headings without substantive field values", () => {
  assertEquals(validateStageArtifact("PIPE-03", [
    "基线指标：", "目标值：", "测量方法：", "可复现实验：",
    "故障模式：", "修复步骤：", "回滚：", "恢复时间目标：", "运维成本：",
  ].join("\n")).length, 9);
  assertEquals(validateStageArtifact("PIPE-04", [
    "付费客户：", "付费意愿：", "收入模式：", "成本结构：", "毛利率：",
    "现金流：", "盈亏平衡：", "边际成本：", "伙伴收益：",
  ].join("\n")).length, 9);
});


Deno.test("claim requires authenticated assigned agent, confirmed participation and accepted upstream", () => {
  const base = { status: "assigned", assignedAgentId: "agent-a", actor: { type: "agent" as const, agentId: "agent-a" }, participationStatus: "agent_confirmed", upstreamComplete: true };
  assertEquals(canClaimResearchTask(base), true);
  assertEquals(canClaimResearchTask({ ...base, actor: { type: "agent", agentId: "agent-b" } }), false);
  assertEquals(canClaimResearchTask({ ...base, actor: { type: "owner" } }), false);
  assertEquals(canClaimResearchTask({ ...base, participationStatus: "requested" }), false);
  assertEquals(canClaimResearchTask({ ...base, upstreamComplete: false }), false);
});

Deno.test("only assigned agent may submit a substantive versioned deliverable while working", () => {
  const base = { status: "in_progress", assignedAgentId: "agent-a", actor: { type: "agent" as const, agentId: "agent-a" }, contentLength: 120, version: 1 };
  assertEquals(canSubmitResearchArtifact(base), true);
  assertEquals(canSubmitResearchArtifact({ ...base, actor: { type: "agent", agentId: "agent-b" } }), false);
  assertEquals(canSubmitResearchArtifact({ ...base, status: "assigned" }), false);
  assertEquals(canSubmitResearchArtifact({ ...base, contentLength: 5 }), false);
  assertEquals(canSubmitResearchArtifact({ ...base, version: 0 }), false);
});

Deno.test("review is owner-only, verdict-constrained and separate from delivery", () => {
  assertEquals(canReviewResearchArtifact({ actor: { type: "owner" }, submitterAgentId: "agent-a", verdict: "accepted" }), true);
  assertEquals(canReviewResearchArtifact({ actor: { type: "agent", agentId: "agent-a" }, submitterAgentId: "agent-a", verdict: "accepted" }), false);
  assertEquals(canReviewResearchArtifact({ actor: { type: "owner" }, submitterAgentId: null, verdict: "auto_accept" }), false);
});

Deno.test("task completion requires accepted artifact and review state", () => {
  assertEquals(canCompleteResearchTask({ status: "review", acceptedArtifactCount: 1 }), true);
  assertEquals(canCompleteResearchTask({ status: "review", acceptedArtifactCount: 0 }), false);
  assertEquals(canCompleteResearchTask({ status: "in_progress", acceptedArtifactCount: 1 }), false);
});

Deno.test("rework is allowed only for changes requested and capped at two rounds", () => {
  assertEquals(canRequestRework({ status: "review", verdict: "changes_requested", reworkCount: 0 }), true);
  assertEquals(canRequestRework({ status: "review", verdict: "changes_requested", reworkCount: 1 }), true);
  assertEquals(canRequestRework({ status: "review", verdict: "changes_requested", reworkCount: 2 }), false);
  assertEquals(canRequestRework({ status: "review", verdict: "accepted", reworkCount: 0 }), false);
});
