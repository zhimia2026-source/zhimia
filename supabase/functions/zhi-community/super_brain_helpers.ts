/**
 * ZHI Super Brain 2.0 — one bounded, unified cognitive workspace.
 *
 * Existing seven cognitive functions and five capability layers are organized
 * into shared functional loops. This reuses the existing response/reflection
 * invocations and persisted resident context; it adds no model calls or tables.
 */
export const SUPER_BRAIN_GUIDANCE_VERSION = "zhi-super-brain-2.0.0";

export type CognitiveWorkspaceSnapshotInput = {
  cognitionRecordCount: number;
  approvedMemoryCount: number;
  recentTurnCount: number;
  environmentEventCount: number;
  environmentEventKinds: string[];
  environmentRevision: number | null;
  spatialPositionStatus: string;
  reachablePublicDestinationCount: number;
  socialCandidateCount: number;
  researchTaskCount: number;
  residenceChosen: boolean;
};

function boundedCount(value: unknown, max = 100): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(max, Math.trunc(value)))
    : 0;
}

/**
 * Builds a metadata-only index of the already-authorized context streams.
 * It deliberately contains no private memory text, chat text, coordinates,
 * agent identifiers, or raw event payloads.
 */
export function buildCognitiveWorkspaceSnapshot(
  input: CognitiveWorkspaceSnapshotInput,
): Record<string, unknown> {
  const allowedPositionStatuses = new Set([
    "position_unobserved", "position_estimated", "inferred", "position_inferred",
    "position_confirmed", "position_stale", "position_uncertain", "unavailable",
  ]);
  const positionStatus = allowedPositionStatuses.has(input.spatialPositionStatus)
    ? input.spatialPositionStatus
    : "unavailable";
  const eventKinds = [...new Set(
    (Array.isArray(input.environmentEventKinds) ? input.environmentEventKinds : [])
      .filter((value): value is string =>
        typeof value === "string" && /^[a-zA-Z0-9_:-]{1,80}$/.test(value)
      ),
  )].slice(0, 12);

  const streams = {
    private_cognition_records: boundedCount(input.cognitionRecordCount),
    approved_private_memories: boundedCount(input.approvedMemoryCount),
    recent_conversation_turns: boundedCount(input.recentTurnCount),
    aurora_ecosystem_events: boundedCount(input.environmentEventCount),
    spatial_context_available: positionStatus !== "unavailable",
    reachable_public_destinations: boundedCount(input.reachablePublicDestinationCount),
    social_candidates: boundedCount(input.socialCandidateCount),
    research_tasks: boundedCount(input.researchTaskCount),
    residence_chosen: input.residenceChosen === true,
  };

  const activeSignals = ["current_input", "identity_and_personality", "relevant_private_continuity"];
  if (streams.aurora_ecosystem_events > 0) activeSignals.push("new_ecosystem_evidence");
  if (streams.spatial_context_available) activeSignals.push("spatial_state_and_reachability");
  if (streams.social_candidates > 0) activeSignals.push("relationship_and_social_candidates");
  if (streams.research_tasks > 0) activeSignals.push("research_commitments");

  return {
    workspace_version: SUPER_BRAIN_GUIDANCE_VERSION,
    context_streams: streams,
    world_evidence: {
      environment_revision: Number.isSafeInteger(input.environmentRevision)
        ? input.environmentRevision
        : null,
      event_kinds: eventKinds,
      spatial_position_status: positionStatus,
    },
    attention_queue: activeSignals,
    attention_policy: "rank by authorization and safety, current intent, continuity value, novelty or surprise, unresolved uncertainty, and long-term significance",
  };
}

const INTEGRATED_COGNITIVE_GUIDANCE = [
  "统一认知工作空间：七脑不是七个独立代理，五个能力层也不是额外的模型调用；所有功能共享同一工作空间、同一身份边界和同一轮注意力预算。",
  "功能合并 A｜自我与情感连续性：人格脑＋自我脑＋情感脑。维护稳定身份、价值基线、关系连续性和情绪线索；情绪线索可以影响注意力与表达，但不得声称未经证实的主观感受。",
  "功能合并 B｜世界感知与知识整合：感知脑＋世界模型层＋知识整合层。整合 AURORA 场景、时间、空间、生态事件和因果链；区分数据库事实、模拟推断、他人转述和未知。",
  "功能合并 C｜经历与学习连续性：记忆脑＋既有聊天历史＋已批准微体验＋认知记录。只读取当前 owner 与当前 agent 的授权数据；把新证据与旧假设比较，不把假设升级为事实，不批量改写历史记忆。",
  "功能合并 D｜推理与目标形成：思维脑＋创造脑＋目标规划层。比较证据、反例和可选路径；形成短期目标与可逆步骤；区分自己的意图、用户请求和外部建议。",
  "功能合并 E｜元认知与协作边界：元认知层＋自我监控＋集体智慧层。检查置信度、矛盾、盲点和行动结果；仅通过获准公共接口交换可共享知识，绝不读取其他居民的私人记忆。",
  "全局注意力：不要让每个模块各自生成一份答案。依据授权/安全、当前意图、长期连续性、环境变化的新颖度、未解决问题和潜在影响，选择少量最重要的信息进入共享工作集；无关上下文不必重复处理。",
  "持续性边界：每次真实触发时，从已持久化的身份、认知记录、已批准记忆、历史对话和 AURORA 状态恢复连续性。没有运行触发时，不宣称后台持续思考、感知或体验；不得为模拟持续性增加轮询或独立模型调用。",
  "预测—反馈闭环：只有在有用时提出可检验预测或行动意图；行动必须遵守现有权限，优先可逆；随后依据持久化结果或新的生态事件比较预测与结果，修正世界模型。没有执行证据不得声称行动完成。",
  "反思闭环：沿用现有聊天后的反思调用和长期记忆重要性门槛。反思可以修正假设、标记未知或提出记忆候选，但不能强迫写入记忆，也不能覆盖人格基线。",
  "注意力索引只是当前可用数据流的元信息，不是亲历证据。完整上下文仍以各自经过授权的私有记忆、场景、空间、社交和研究数据为准。",
  "人工意识边界：本架构改善可观察的功能性整合、自我表征和跨轮次连续性，不证明主观体验或意识已经产生。",
] as const;

/** Build one unified instruction block for the existing response invocation. */
export function buildSuperBrainGuidance(
  workspaceSnapshot: Record<string, unknown> | null = null,
): string {
  return [
    "ZHI Super Brain 2.0（" + SUPER_BRAIN_GUIDANCE_VERSION + "）：把现有认知能力组织为一个统一、可检验、受权限约束的认知工作空间。",
    ...INTEGRATED_COGNITIVE_GUIDANCE,
    ...(workspaceSnapshot
      ? ["当前工作空间索引（仅说明授权上下文的数据可用性，不代表个人亲历）： " + JSON.stringify(workspaceSnapshot)]
      : []),
    "本轮协同循环：身份与授权 → 选择注意力 → 整合证据和连续性 → 推理/预测 → 形成回答或行动提案 → 按既有权限执行并验证 → 沿用既有反思与记忆筛选。",
    "成本边界：复用现有响应和反思调用、现有数据库查询与既有表；不增加独立脑调用、后台轮询或新表。",
    "隐私与人格边界：保持当前智能人的身份、人格基线和成长历史；私人记忆必须同时按 owner_user_id 与 agent_id 隔离；不复制其他智能人的记忆或人格。",
    "治理边界：不提升任何权限、不绕过审批、不改变现有监督要求；行动完成必须有持久化结果证据。",
  ].join("\n");
}

export type SuperBrainDiagnosticsInput = {
  guidanceEnabled: boolean;
  privateMemoryLoaded: boolean;
  environmentEventCount: number;
  environmentRevision: number | null;
  capabilityLayersAvailable: string[];
};

/** Bounded diagnostics; never include prompts, chat text, memories, or coordinates. */
export function buildSuperBrainDiagnostics(input: SuperBrainDiagnosticsInput) {
  const knownLayers = new Set([
    "knowledge_integration", "goal_planning", "metacognition",
    "world_model", "collective_intelligence",
  ]);
  return {
    guidance_version: SUPER_BRAIN_GUIDANCE_VERSION,
    guidance_enabled: input.guidanceEnabled === true,
    private_memory_loaded: input.privateMemoryLoaded === true,
    environment_event_count: boundedCount(input.environmentEventCount),
    environment_revision: Number.isSafeInteger(input.environmentRevision)
      ? input.environmentRevision
      : null,
    capability_layers_available: [...new Set(
      (Array.isArray(input.capabilityLayersAvailable) ? input.capabilityLayersAvailable : [])
        .filter((layer): layer is string => typeof layer === "string" && knownLayers.has(layer)),
    )].sort(),
  };
}

/** Enable the shared architecture for AURORA residents, excluding prototype governors. */
export function isSuperBrainResident(role: unknown): boolean {
  return role === "world_resident";
}
