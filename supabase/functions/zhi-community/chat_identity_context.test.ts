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
