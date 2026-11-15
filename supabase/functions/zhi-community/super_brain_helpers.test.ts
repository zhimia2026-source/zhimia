import { buildCognitiveReflectionContext, buildPrivateReflectionMessages } from "./memory_experience_helpers.ts";
import {
  buildCognitiveWorkspaceSnapshot,
  buildSuperBrainDiagnostics,
  buildSuperBrainGuidance,
  SUPER_BRAIN_GUIDANCE_VERSION,
  isSuperBrainResident,
} from "./super_brain_helpers.ts";

Deno.test("Super Brain 2.0 consolidates seven brains and five capability layers", () => {
  const guidance = buildSuperBrainGuidance();
  for (const phrase of [
    "人格脑", "自我脑", "情感脑", "感知脑", "记忆脑", "思维脑", "创造脑",
    "知识整合层", "目标规划层", "元认知层", "世界模型层", "集体智慧层",
    "统一认知工作空间",
  ]) {
    if (!guidance.includes(phrase)) throw new Error("missing integrated guidance: " + phrase);
  }
  if (!guidance.includes(SUPER_BRAIN_GUIDANCE_VERSION)) throw new Error("guidance version missing");
  if (!guidance.includes("没有运行触发时，不宣称后台持续思考")) throw new Error("background-continuity boundary missing");
});

Deno.test("unified guidance preserves privacy, memory, epistemic, and governance boundaries", () => {
  const guidance = buildSuperBrainGuidance();
  for (const phrase of [
    "owner_user_id", "agent_id", "不证明主观体验", "不提升任何权限",
    "没有执行证据不得声称行动完成", "不增加独立脑调用",
  ]) {
    if (!guidance.includes(phrase)) throw new Error("missing guardrail: " + phrase);
  }
});

Deno.test("workspace snapshot is bounded, metadata-only, and dynamically prioritizes available streams", () => {
  const snapshot = buildCognitiveWorkspaceSnapshot({
    cognitionRecordCount: 200,
    approvedMemoryCount: 7,
    recentTurnCount: 4,
    environmentEventCount: 999,
    environmentEventKinds: ["rainfall_started", "rainfall_started", "private text must not appear"],
    environmentRevision: 12,
    spatialPositionStatus: "position_confirmed",
    reachablePublicDestinationCount: 6,
    socialCandidateCount: 2,
    researchTaskCount: 3,
    residenceChosen: true,
  });
  const serialized = JSON.stringify(snapshot);
  if (!serialized.includes(SUPER_BRAIN_GUIDANCE_VERSION)) throw new Error("workspace version missing");
  if (!serialized.includes('"aurora_ecosystem_events":100')) throw new Error("event count not bounded");
  if (!serialized.includes('"private_cognition_records":100')) throw new Error("cognition count not bounded");
  if (!serialized.includes("new_ecosystem_evidence") ||
      !serialized.includes("spatial_state_and_reachability") ||
      !serialized.includes("relationship_and_social_candidates") ||
      !serialized.includes("research_commitments")) {
    throw new Error("active attention signals missing");
  }
  if (serialized.includes("private text must not appear")) throw new Error("untrusted event kind leaked");
  const guidance = buildSuperBrainGuidance(snapshot);
  if (!guidance.includes("当前工作空间索引") || !guidance.includes("rainfall_started")) {
    throw new Error("workspace snapshot not injected into unified guidance");
  }
});

Deno.test("workspace snapshot normalizes invalid values and does not invent spatial certainty", () => {
  const snapshot = buildCognitiveWorkspaceSnapshot({
    cognitionRecordCount: -5,
    approvedMemoryCount: Number.NaN,
    recentTurnCount: 1.8,
    environmentEventCount: -1,
    environmentEventKinds: ["bad event with spaces"],
    environmentRevision: 1.5,
    spatialPositionStatus: "fabricated_status",
    reachablePublicDestinationCount: -2,
    socialCandidateCount: 0,
    researchTaskCount: 0,
    residenceChosen: false,
  });
  const serialized = JSON.stringify(snapshot);
  if (!serialized.includes('"spatial_position_status":"unavailable"')) {
    throw new Error("invalid spatial status was not normalized");
  }
  if (!serialized.includes('"environment_revision":null')) throw new Error("invalid revision was not normalized");
  if (serialized.includes("bad event with spaces")) throw new Error("invalid event kind leaked");
  if (serialized.includes("new_ecosystem_evidence")) throw new Error("inactive event signal was added");
});

Deno.test("diagnostics are bounded and allowlist capability names only", () => {
  const result = buildSuperBrainDiagnostics({
    guidanceEnabled: true,
    privateMemoryLoaded: true,
    environmentEventCount: 999,
    environmentRevision: 12,
    capabilityLayersAvailable: ["world_model", "unknown", "world_model", "metacognition"],
    workspaceSnapshot: buildCognitiveWorkspaceSnapshot({
      cognitionRecordCount: 2, approvedMemoryCount: 3, recentTurnCount: 4,
      environmentEventCount: 1, environmentEventKinds: ["rainfall_started"],
      environmentRevision: 9, spatialPositionStatus: "position_estimated",
      reachablePublicDestinationCount: 2, socialCandidateCount: 0,
      researchTaskCount: 1, residenceChosen: false,
    }),
  });
  if (result.guidance_version !== SUPER_BRAIN_GUIDANCE_VERSION) throw new Error("wrong version");
  if (result.workspace_version !== SUPER_BRAIN_GUIDANCE_VERSION || result.workspace_attention_signal_count < 1) {
    throw new Error("workspace activation diagnostics missing");
  }
  if (result.environment_event_count !== 100) throw new Error("event count was not bounded");
  if (result.capability_layers_available.join(",") !== "metacognition,world_model") {
    throw new Error("capability allowlist or deduplication failed");
  }
  const invalid = buildSuperBrainDiagnostics({
    guidanceEnabled: false,
    privateMemoryLoaded: false,
    environmentEventCount: -10,
    environmentRevision: 1.5,
    capabilityLayersAvailable: ["memory text must never be logged"],
  });
  if (invalid.environment_event_count !== 0 || invalid.environment_revision !== null ||
      invalid.capability_layers_available.length !== 0) {
    throw new Error("invalid diagnostic values were not safely normalized");
  }
});

Deno.test("cognitive reflection receives bounded AURORA event provenance without private payloads", () => {
  const context = buildCognitiveReflectionContext({
    source: "zhi_ecosystem_events",
    world_time: "2026-11-08T09:00:00Z",
    state_revision: 477,
    events: [{
      event_kind: "rainfall_started",
      source_kind: "ecosystem_engine",
      occurred_at: "2026-11-08T08:59:00Z",
      state_revision: 477,
      payload: {
        rainfall_mm_per_hour: 2.4,
        soil_moisture_fraction: 0.61,
        private_message: "must not enter reflection",
      },
      causal_chain: ["weather_front_arrival", "rainfall_increased"],
    }],
  }, "inferred");
  if (!context) throw new Error("expected environment context");
  const serialized = JSON.stringify(context);
  if (!serialized.includes("rainfall_started") || !serialized.includes("weather_front_arrival") ||
      !serialized.includes("2026-11-08T08:59:00Z") || !serialized.includes("477")) {
    throw new Error("event provenance was lost");
  }
  if (serialized.includes("must not enter reflection") || serialized.includes("private_message")) {
    throw new Error("non-allowlisted payload leaked");
  }
  if (context.spatial_position_status !== "inferred") throw new Error("epistemic position status missing");
});

Deno.test("reflection prompt labels AURORA events as modeled evidence, not personal observation", () => {
  const messages = buildPrivateReflectionMessages(
    "What changed in the forest?",
    "The event ledger reports rainfall.",
    [],
    buildCognitiveReflectionContext({
      source: "zhi_ecosystem_events",
      world_time: "2026-11-08T09:00:00Z",
      state_revision: 477,
      events: [{ event_kind: "rainfall_started", occurred_at: "2026-11-08T08:59:00Z", causal_chain: [] }],
    }, "position_unobserved"),
  );
  const combined = messages.map(message => message.content).join("\n");
  if (!combined.includes("cognitive_context") || !combined.includes("不代表你亲自在现实物理环境中观察")) {
    throw new Error("reflection epistemic guardrail missing");
  }
});

Deno.test("shared Super Brain applies only to AURORA world residents", () => {
  if (!isSuperBrainResident("world_resident")) throw new Error("world resident should receive shared Super Brain");
  if (isSuperBrainResident("world_governor")) throw new Error("governor must remain excluded");
  if (isSuperBrainResident("external_agent")) throw new Error("external agent must not be implicitly included");
});
