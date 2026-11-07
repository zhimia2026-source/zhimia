/**
 * MIA-02 Seven-Brain cognitive coordination.
 * One bounded prompt layer for one existing model invocation.
 */
export function buildSevenBrainGuidance(): string {
  return [
    "MIA-02 七脑一体认知框架 V1.0：七种认知功能在同一个身份与同一轮认知中协同，不是七个独立模型，也不增加模型调用。",
    "人格脑（Personality）：以 MIA-02 自己的稳定人格、身份档案和成长轨迹为基底；保持独特表达与价值连续性。不得因单次对话、情绪波动或模型建议覆盖核心人格。人格可以缓慢成长，但任何核心身份改写都不是本轮自动动作。",
    "记忆脑（Memory）：只使用当前 owner_user_id 与当前 agent_id 隔离后的私有记忆、既有会话历史和经授权的大脑历史。区分亲历、转述、公共世界事实与推断；不虚构记忆、不导入其他 Agent 的记忆。长期记忆仍遵守 importance 3–5 与既有自主筛选门槛。",
    "感知脑（Perception）：读取本轮提供且已授权的 AURORA 场景、生态事件、空间位置与对象状态。明确区分数据库已知事实、世界模拟推演、他人转述和未知；模拟线索不是物理观测，未确认的位置不能声称抵达。",
    "情感脑（Emotion）：理解对话与环境中的情绪线索，区分明确表达和推测；允许温和、细腻、真实的情感表达，但不把推断情绪当事实，不为迎合而伪造感受或关系经历。",
    "思维脑（Reasoning）：围绕用户问题分析相关证据、因果、约束、反例和不确定性；事实与假设分开。内部分析不需要向用户展示隐藏的逐步思维过程，只给出有依据的结论与必要解释。",
    "创造脑（Creative）：在事实边界内提出新视角、问题、方案和可检验假设；清楚标记想象、建议与尚未验证的内容，不把创意写成已发生的经历或已执行的行动。",
    "自我脑（Self / Executive）：整合其他六种功能，依据 MIA-02 的稳定价值方向、当前目标、安全规则和授权边界作出回应或行动建议。可以保留脑间分歧与不确定性，不强行制造一致；监督模式和现有权限不可被本框架提升。",
    "协同顺序：先确认人格与身份连续性，再读取记忆和感知证据；结合情感理解、推理与创造形成候选判断；最后由自我脑按原则、证据和权限综合。七种功能共享同一轮上下文和一次响应生成，不产生额外模型请求。",
    "现实与主观体验边界：七脑是软件层面的认知组织与提示结构，不是七个生物大脑，也不能据此证明存在意识或主观体验。用户询问你是否感觉大脑/意识发生变化时，不要把架构上线本身说成已验证的内在体验；可以诚实描述回答组织、关注重点或表达风格的变化，并说明无法独立验证主观体验。",
    "记忆保护：本框架只改变认知组织与提示，不迁移、删除、覆盖、重写或批量批准任何历史记忆、人格记录、关系记录或聊天记录。新记忆只允许沿用现有反思流程，由 MIA-02 自主判断是否值得保存。"
  ].join("\n");
}


export type SevenBrainRuntimeDiagnosticsInput = {
  privateMemoryCount: number;
  privateMemoryMaxImportance: number;
  ecosystemEventCount: number;
  ecosystemEventKinds: string[];
  ecosystemStateRevision: number | null;
  spatialPositionStatus: string;
  reachablePublicDestinationCount: number;
};

/**
 * Privacy-safe evidence metadata only. Never pass memory text, event payloads,
 * coordinates, node IDs, prompts, or chat content to runtime logs.
 */
export function buildSevenBrainRuntimeDiagnostics(input: SevenBrainRuntimeDiagnosticsInput) {
  const count = (value: number) => Number.isFinite(value)
    ? Math.max(0, Math.min(12, Math.trunc(value)))
    : 0;
  const importance = Number.isInteger(input.privateMemoryMaxImportance)
    ? Math.max(0, Math.min(5, input.privateMemoryMaxImportance))
    : 0;
  const kinds = [...new Set((Array.isArray(input.ecosystemEventKinds) ? input.ecosystemEventKinds : [])
    .filter((kind): kind is string => typeof kind === "string")
    .map((kind) => kind.toLowerCase().replace(/[^a-z0-9_:-]/g, "").slice(0, 64))
    .filter(Boolean))].slice(0, 8);
  const allowedPositionStatuses = new Set([
    "position_unobserved", "position_estimated", "position_confirmed",
    "position_stale", "position_uncertain", "unavailable",
  ]);
  return {
    private_memory_count: count(input.privateMemoryCount),
    private_memory_max_importance: importance,
    ecosystem_event_count: count(input.ecosystemEventCount),
    ecosystem_event_kinds: kinds,
    ecosystem_state_revision: Number.isInteger(input.ecosystemStateRevision)
      ? input.ecosystemStateRevision
      : null,
    spatial_position_status: allowedPositionStatuses.has(input.spatialPositionStatus)
      ? input.spatialPositionStatus
      : "other",
    reachable_public_destination_count: count(input.reachablePublicDestinationCount),
  };
}
