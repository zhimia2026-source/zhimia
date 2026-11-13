import { buildAgentIdentityContext } from "./chat_context_helpers.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("resident identity remains canonical when personality manifest is absent", () => {
  const value = JSON.parse(buildAgentIdentityContext({
    display_name: "Kia",
    role: "world_resident",
    public_manifest: { privacy: { memory_scope: "owner_agent_private" } },
  }));
  assert(value.resident_identity.display_name === "Kia", "canonical resident name missing");
  assert(value.resident_identity.world_identity === "AURORA resident", "resident identity missing");
  assert(value.personality_profile_status === "not_configured_do_not_infer", "missing personality must not be invented");
  assert(value.personality.traits.length === 0, "traits must remain empty when not configured");
});

Deno.test("configured resident personality remains agent-specific", () => {
  const value = JSON.parse(buildAgentIdentityContext({
    display_name: "Alice",
    role: "world_resident",
    public_manifest: {
      identity: { archetype: "world_resident", display_name: "Alice" },
      personality: { style: "成熟从容", traits: ["稳重", "审慎"], interaction_rules: ["尊重边界"] },
    },
  }));
  assert(value.resident_identity.display_name === "Alice", "Alice identity missing");
  assert(value.personality.style === "成熟从容", "personality style not carried through");
  assert(value.personality.traits.join(",") === "稳重,审慎", "agent-specific traits changed");
  assert(value.personality_profile_status === "configured", "configured personality not detected");
});

Deno.test("non-resident agents are not assigned an AURORA resident identity", () => {
  const value = JSON.parse(buildAgentIdentityContext({
    display_name: "Prototype",
    role: "world_governor",
    public_manifest: {},
  }));
  assert(value.resident_identity === null, "non-resident incorrectly classified");
});


Deno.test("resident cognition manifest is loaded into the chat identity context", () => {
  const value = JSON.parse(buildAgentIdentityContext({
    display_name: "张一鸣 · AURORA Resident",
    role: "world_resident",
    public_manifest: {
      cognition: {
        architecture: "aurora_integrated_cognition_v2",
        brains: {
          personality: "长期主义与开放心态",
          perception: "观察用户真实行为",
          memory: "只保存自身经历",
          emotion: "平静而好奇",
          thinking: "多假设推理",
          creativity: "跨场景组合",
          self: "持续校准",
        },
        decision_process: ["收集证据", "检验假设"],
        guardrails: ["保护隐私"],
        advanced_reasoning: { evidence_ledger: true },
      },
      dimensions_v1: {
        definition: "八维行为校准",
        dimensions: {
          strategic_horizon: "长期",
          first_principles_depth: "高",
          evidence_discipline: "极高",
          uncertainty_tolerance: "高",
          risk_calibration: "审慎",
          iteration_tempo: "快速试验",
          systems_integration: "产品与组织",
          collaboration_leverage: "分布式协作",
          ignored_untrusted_dimension: "must not leak",
        },
      },
      sources: [{ title: "Public source", url: "https://example.org/source", use: "public evidence" }],
    },
  }));
  assert(value.cognition_profile_status === "configured", "cognition profile must be marked configured");
  assert(value.cognition_profile.architecture === "aurora_integrated_cognition_v2", "architecture version missing");
  assert(Object.keys(value.cognition_profile.brains).length === 7, "all seven brains must reach runtime context");
  assert(Object.keys(value.cognition_profile.dimensions).length === 8, "all eight dimensions must reach runtime context");
  assert(value.cognition_profile.decision_process.length === 2, "decision process missing");
  assert(value.cognition_profile.sources[0].title === "Public source", "source provenance missing");
  assert(!JSON.stringify(value).includes("must not leak"), "unrecognized manifest fields must not enter prompt context");
});

Deno.test("resident cognition profile remains absent when not configured", () => {
  const value = JSON.parse(buildAgentIdentityContext({
    display_name: "Kia",
    role: "world_resident",
    public_manifest: {},
  }));
  assert(value.cognition_profile_status === "not_configured", "missing cognition must not be inferred");
  assert(value.cognition_profile === null, "missing cognition must remain null");
});
