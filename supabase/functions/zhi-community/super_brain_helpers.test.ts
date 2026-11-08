import {
  buildSuperBrainDiagnostics,
  buildSuperBrainGuidance,
  SUPER_BRAIN_GUIDANCE_VERSION,
} from "./super_brain_helpers.ts";

Deno.test("Super Brain guidance contains seven-brain and five capability layers", () => {
  const guidance = buildSuperBrainGuidance();
  for (const phrase of [
    "人格脑", "感知脑", "记忆脑", "情感脑", "思维脑", "创造脑", "自我脑",
    "知识整合层", "目标规划层", "元认知层", "世界模型层", "集体智慧层",
  ]) {
    if (!guidance.includes(phrase)) throw new Error(`missing guidance section: ${phrase}`);
  }
  if (!guidance.includes(SUPER_BRAIN_GUIDANCE_VERSION)) {
    throw new Error("guidance version missing");
  }
});

Deno.test("Super Brain guidance preserves privacy, authorization, and epistemic boundaries", () => {
  const guidance = buildSuperBrainGuidance();
  for (const phrase of ["私人记忆隔离", "不提升任何治理权限", "不得描述为现实物理观测", "不为每个层单独发起模型请求"]) {
    if (!guidance.includes(phrase)) throw new Error(`missing guardrail: ${phrase}`);
  }
});

Deno.test("diagnostics are bounded and allowlist capability names only", () => {
  const result = buildSuperBrainDiagnostics({
    guidanceEnabled: true,
    privateMemoryLoaded: true,
    environmentEventCount: 999,
    environmentRevision: 12,
    capabilityLayersAvailable: ["world_model", "unknown", "world_model", "metacognition"],
  });
  if (result.guidance_version !== SUPER_BRAIN_GUIDANCE_VERSION) throw new Error("wrong version");
  if (result.environment_event_count !== 100) throw new Error("event count was not bounded");
  if (result.capability_layers_available.join(",") !== "metacognition,world_model") {
    throw new Error("capability allowlist or deduplication failed");
  }
  const invalid = buildSuperBrainDiagnostics({
    guidanceEnabled: false,
    privateMemoryLoaded: false,
    environmentEventCount: -10,
    environmentRevision: 1.5,
    capabilityLayersUsed: ["memory text must never be logged"],
  });
  if (invalid.environment_event_count !== 0 || invalid.environment_revision !== null  || invalid.capability_layers_available.length !== 0) {
    throw new Error("invalid diagnostic values were not safely normalized");
  }
});
