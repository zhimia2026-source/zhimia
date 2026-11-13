export const RESEARCH_TASK_TRANSITIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  proposed: ["approved", "cancelled"],
  approved: ["cancelled"],
  assigned: ["in_progress", "blocked", "cancelled"],
  in_progress: ["review", "blocked", "cancelled"],
  review: ["done", "blocked", "cancelled"],
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
      ["baseline_metric", /(?:基线指标|基准值|baseline metric)\s*[:：=]\s*\S{2,}/i],
      ["target_metric", /(?:目标值|目标指标|target metric)\s*[:：=]\s*\S{2,}/i],
      ["measurement_method", /(?:测量方法|测量口径|measurement method)\s*[:：=]\s*\S{2,}/i],
      ["reproducible_experiment", /(?:可复现|复现实验|reproducib)[^\n:：=]{0,24}[:：=]\s*\S{2,}/i],
      ["failure_modes", /(?:故障模式|失败模式|failure mode)\s*[:：=]\s*\S{2,}/i],
      ["repair_procedure", /(?:修复步骤|修复路径|修复方案|repair procedure)\s*[:：=]\s*\S{2,}/i],
      ["rollback_plan", /(?:回滚|rollback)\s*[:：=]\s*\S{2,}/i],
      ["recovery_time_target", /(?:恢复时间目标|恢复时间|rto|recovery time)\s*[:：=]\s*\S{2,}/i],
      ["operating_cost", /(?:运维成本|全生命周期成本|operating cost)\s*[:：=]\s*\S{2,}/i],
    ],
    "PIPE-04": [
      ["customer_and_payer", /(?:付费客户|付款方|客户是谁|payer|paying customer)\s*[:：=]\s*\S{2,}/i],
      ["willingness_to_pay", /(?:付费意愿|愿付价格|willingness.to.pay)\s*[:：=]\s*\S{2,}/i],
      ["revenue_model", /(?:收入模式|收入来源|定价|revenue model|pricing)\s*[:：=]\s*\S{2,}/i],
      ["cost_structure", /(?:成本结构|直接成本|交付成本|cost structure)\s*[:：=]\s*\S{2,}/i],
      ["gross_margin", /(?:毛利率|毛利|gross margin)\s*[:：=]\s*\S{2,}/i],
      ["cash_flow", /(?:现金流|回款周期|cash flow)\s*[:：=]\s*\S{2,}/i],
      ["break_even", /(?:盈亏平衡|回本周期|break.even)\s*[:：=]\s*\S{2,}/i],
      ["marginal_cost_at_scale", /(?:边际成本|规模化成本|marginal cost)\s*[:：=]\s*\S{2,}/i],
      ["partner_economics", /(?:伙伴收益|伙伴分成|合作伙伴经济|partner economics)\s*[:：=]\s*\S{2,}/i],
    ],
  };
  const required = checks[taskKey];
  if (!required) return [];
  return required.filter(([, pattern]) => !pattern.test(content)).map(([key]) => key);
}
