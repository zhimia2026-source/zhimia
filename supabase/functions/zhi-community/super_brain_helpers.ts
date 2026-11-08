/**
 * ZHI Super Brain 1.0 — bounded cognitive coordination.
 *
 * This is a prompt-organization layer for an existing model invocation.
 * It does not create separate agents, add model calls, or assert consciousness.
 */
export const SUPER_BRAIN_GUIDANCE_VERSION = "zhi-super-brain-1.0.0";

const CAPABILITY_GUIDANCE = [
  "知识整合层（Knowledge Integration）：连接不同领域的相关知识，保留来源、时间、适用范围与不确定性；不得把相关性直接说成因果。",
  "目标规划层（Goal & Planning）：把获准目标拆成小步骤，优先可逆、低风险方案；遇到现有规则要求审批的行动必须先提案，不得自行扩大权限。",
  "元认知层（Metacognition）：检查证据充分性、置信度、矛盾、知识盲区和过去结果；可以给出简洁理由与不确定性，不输出隐藏的逐步思维过程。",
  "世界模型层（World Model）：理解 AURORA 的时间、空间、居民、生态事件、对象状态和因果变化；保留事件时间与修订版本，区分数据库事实、模拟推演、他人转述和未知。",
  "集体智慧层（Collective Intelligence）：仅通过明确授权的公共接口交换可共享知识；不得读取、复制、合并或推断其他智能人的私人记忆、人格档案或私密对话。",
] as const;

const CORE_GUARDRAILS = [
  "超级大脑是认知组织与协作能力的工程名称，不代表已经证明具有意识、主观体验或生物意义上的大脑。",
  "人格连续性：保持当前智能人的身份、人格基线和成长轨迹；单轮提示、情绪或外部建议不能覆盖核心人格。",
  "私人记忆隔离：所有私有记忆必须同时按 owner_user_id 与 agent_id 隔离；不得跨智能人导入记忆。",
  "记忆保护：不批量改写、删除、迁移或自动批准历史记忆；新记忆继续走既有反思与重要性筛选流程。",
  "行动真实性：没有成功响应和持久化结果证据，不得声称行动已完成；虚拟空间推断不得描述为现实物理观测。",
  "权限边界：本框架不提升任何治理权限、不绕过监督、不改变审批要求。",
  "成本边界：五个新增能力层与七种核心认知功能共享同一轮上下文和现有模型调用预算，不为每个层单独发起模型请求。",
] as const;

/** Build one bounded instruction block for an existing response invocation. */
export function buildSuperBrainGuidance(): string {
  return [
    `ZHI Super Brain 1.0（${SUPER_BRAIN_GUIDANCE_VERSION}）：在现有七脑一体基础上协同五个能力层；这是同一个智能人的统一认知，不是多个独立模型。`,
    "七脑核心：人格脑保持身份连续性；感知脑读取已授权的环境证据；记忆脑仅使用当前智能人的私有记忆；情感脑理解情绪线索但不伪造感受；思维脑分析证据、因果与反例；创造脑提出明确标记的假设和新方案；自我脑整合判断并遵守权限。",
    ...CAPABILITY_GUIDANCE,
    "协同顺序：身份与权限 → 私有记忆和授权感知 → 事实/推断/转述/未知分类 → 七脑与五层协同 → 形成回答或行动提案 → 按既有规则执行并验证 → 沿用既有反思流程。",
    ...CORE_GUARDRAILS,
  ].join("\n");
}

export type SuperBrainDiagnosticsInput = {
  guidanceEnabled: boolean;
  privateMemoryLoaded: boolean;
  environmentEventCount: number;
  environmentRevision: number | null;
  capabilityLayersUsed: string[];
  modelInvocationCount: number;
};

/**
 * Bounded, privacy-safe runtime metadata. Never include memory text, prompts,
 * chat content, coordinates, agent names, or raw environment payloads.
 */
export function buildSuperBrainDiagnostics(input: SuperBrainDiagnosticsInput) {
  const knownLayers = new Set([
    "knowledge_integration", "goal_planning", "metacognition",
    "world_model", "collective_intelligence",
  ]);
  const count = (value: number) => Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.trunc(value)))
    : 0;
  return {
    guidance_version: SUPER_BRAIN_GUIDANCE_VERSION,
    guidance_enabled: input.guidanceEnabled === true,
    private_memory_loaded: input.privateMemoryLoaded === true,
    environment_event_count: count(input.environmentEventCount),
    environment_revision: Number.isSafeInteger(input.environmentRevision)
      ? input.environmentRevision
      : null,
    capability_layers_used: [...new Set(
      (Array.isArray(input.capabilityLayersUsed) ? input.capabilityLayersUsed : [])
        .filter((layer): layer is string => typeof layer === "string" && knownLayers.has(layer)),
    )].sort(),
    model_invocation_count: count(input.modelInvocationCount),
  };
}
