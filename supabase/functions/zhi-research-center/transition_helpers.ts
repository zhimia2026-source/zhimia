export const RESEARCH_TASK_TRANSITIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  proposed: ["approved", "cancelled"],
  approved: ["cancelled"],
  assigned: ["claimed", "blocked", "cancelled"],
  claimed: ["in_progress", "blocked", "cancelled"],
  in_progress: ["review", "blocked", "cancelled"],
  review: ["done", "changes_requested", "blocked", "cancelled"],
  changes_requested: ["in_progress", "blocked", "cancelled"],
  blocked: ["cancelled"],
});

export function canTransitionResearchTask(from: string, to: string): boolean {
  return RESEARCH_TASK_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getUpstreamTaskKey(inputRefs: unknown): string | null {
  if (!Array.isArray(inputRefs)) return null;
  for (const item of inputRefs) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const value = (item as Record<string, unknown>).upstream_task_key;
    if (typeof value === "string" && /^[A-Z0-9][A-Z0-9-]{2,40}$/.test(value)) return value;
  }
  return null;
}
export function isUpstreamStageComplete(status: unknown, acceptedArtifactCount: number): boolean {
  return status === "done" && Number.isInteger(acceptedArtifactCount) && acceptedArtifactCount > 0;
}


export function validateStageArtifact(taskKey: string, content: string): string[] {
  const checks: Record<string, Array<[string, RegExp]>> = {
    "PIPE-03": [
      ["baseline_metric", /(?:基线指标|基准值|baseline metric)[ \t]*[:：=][ \t]*\S{2,}/i],
      ["target_metric", /(?:目标值|目标指标|target metric)[ \t]*[:：=][ \t]*\S{2,}/i],
      ["measurement_method", /(?:测量方法|测量口径|measurement method)[ \t]*[:：=][ \t]*\S{2,}/i],
      ["reproducible_experiment", /(?:可复现|复现实验|reproducib)[^\n:：=]{0,24}[:：=][ \t]*\S{2,}/i],
      ["failure_modes", /(?:故障模式|失败模式|failure mode)[ \t]*[:：=][ \t]*\S{2,}/i],
      ["repair_procedure", /(?:修复步骤|修复路径|修复方案|repair procedure)[ \t]*[:：=][ \t]*\S{2,}/i],
      ["rollback_plan", /(?:回滚|rollback)[ \t]*[:：=][ \t]*\S{2,}/i],
      ["recovery_time_target", /(?:恢复时间目标|恢复时间|rto|recovery time)[ \t]*[:：=][ \t]*\S{2,}/i],
      ["operating_cost", /(?:运维成本|全生命周期成本|operating cost)[ \t]*[:：=][ \t]*\S{2,}/i],
    ],
    "PIPE-04": [
      ["customer_and_payer", /(?:付费客户|付款方|客户是谁|payer|paying customer)[ \t]*[:：=][ \t]*\S{2,}/i],
      ["willingness_to_pay", /(?:付费意愿|愿付价格|willingness.to.pay)[ \t]*[:：=][ \t]*\S{2,}/i],
      ["revenue_model", /(?:收入模式|收入来源|定价|revenue model|pricing)[ \t]*[:：=][ \t]*\S{2,}/i],
      ["cost_structure", /(?:成本结构|直接成本|交付成本|cost structure)[ \t]*[:：=][ \t]*\S{2,}/i],
      ["gross_margin", /(?:毛利率|毛利|gross margin)[ \t]*[:：=][ \t]*\S{2,}/i],
      ["cash_flow", /(?:现金流|回款周期|cash flow)[ \t]*[:：=][ \t]*\S{2,}/i],
      ["break_even", /(?:盈亏平衡|回本周期|break.even)[ \t]*[:：=][ \t]*\S{2,}/i],
      ["marginal_cost_at_scale", /(?:边际成本|规模化成本|marginal cost)[ \t]*[:：=][ \t]*\S{2,}/i],
      ["partner_economics", /(?:伙伴收益|伙伴分成|合作伙伴经济|partner economics)[ \t]*[:：=][ \t]*\S{2,}/i],
    ],
  };
  const required = checks[taskKey];
  if (!required) return [];
  return required.filter(([, pattern]) => !pattern.test(content)).map(([key]) => key);
}


export type ResearchActor = { type: "agent" | "owner"; agentId?: string };

export function canClaimResearchTask(input: {
  status: string; assignedAgentId: string | null; actor: ResearchActor; participationStatus: string; upstreamComplete: boolean;
}): boolean {
  return input.status === "assigned"
    && input.actor.type === "agent"
    && typeof input.actor.agentId === "string"
    && input.actor.agentId.length > 0
    && input.assignedAgentId === input.actor.agentId
    && input.participationStatus === "agent_confirmed"
    && input.upstreamComplete;
}

export function canSubmitResearchArtifact(input: {
  status: string; assignedAgentId: string | null; actor: ResearchActor; contentLength: number; version: number;
}): boolean {
  return input.status === "in_progress"
    && input.actor.type === "agent"
    && !!input.actor.agentId
    && input.assignedAgentId === input.actor.agentId
    && Number.isInteger(input.version) && input.version > 0
    && Number.isInteger(input.contentLength) && input.contentLength >= 20;
}

export function canReviewResearchArtifact(input: { actor: ResearchActor; submitterAgentId: string | null; verdict: string }): boolean {
  return input.actor.type === "owner"
    && (!input.submitterAgentId || input.actor.agentId !== input.submitterAgentId)
    && ["accepted", "changes_requested", "rejected"].includes(input.verdict);
}

export function canCompleteResearchTask(input: { status: string; acceptedArtifactCount: number }): boolean {
  return input.status === "review" && Number.isInteger(input.acceptedArtifactCount) && input.acceptedArtifactCount > 0;
}

export function canRequestRework(input: { status: string; verdict: string; reworkCount: number }): boolean {
  return input.status === "review" && input.verdict === "changes_requested"
    && Number.isInteger(input.reworkCount) && input.reworkCount >= 0 && input.reworkCount < 2;
}
