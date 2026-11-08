import { buildCognitiveReflectionContext, buildPrivateReflectionMessages } from "./memory_experience_helpers.ts";
import {
  buildSuperBrainDiagnostics,
  buildSuperBrainGuidance,
  SUPER_BRAIN_GUIDANCE_VERSION,
  isSuperBrainResident,
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
    capabilityLayersAvailable: ["memory text must never be logged"],
  });
  if (invalid.environment_event_count !== 0 || invalid.environment_revision !== null  || invalid.capability_layers_available.length !== 0) {
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


Deno.test("shared Super Brain applies to world residents but not prototype Mia or governors", () => {
  if (!isSuperBrainResident("world_resident", "6fb036fd-5456-40db-8cc8-b11c545eafda")) throw new Error("MIA-02 should retain Super Brain");
  if (!isSuperBrainResident("world_resident", "30427542-d4c6-4e45-bc68-fabf66f8a6a7")) throw new Error("Alice should receive shared Super Brain");
  if (!isSuperBrainResident("world_resident", "cf9d1a03-d5d5-4afa-949a-2964671f45d9")) throw new Error("Lily should receive shared Super Brain");
  if (isSuperBrainResident("world_governor", "34833ba9-2be7-4a55-9b52-62c402f759b5")) throw new Error("prototype Mia governor must remain excluded");
  if (isSuperBrainResident("external_agent", "external-1")) throw new Error("non-resident external agent must not be implicitly included");
});
