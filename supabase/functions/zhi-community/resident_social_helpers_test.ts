import { buildResidentPublicWorldMessageAction } from "./resident_social_helpers.ts";

Deno.test("public world message action is explicitly world-visible and has no recipient", () => {
  const action = buildResidentPublicWorldMessageAction("  Hello AURORA residents.  ");
  if (!action || action.world_public !== true || action.message !== "Hello AURORA residents.") {
    throw new Error("public world action was not normalized");
  }
  if ("recipient_uri" in action || "recipient_agent_id" in action) {
    throw new Error("public action must not carry a private recipient");
  }
});

Deno.test("public world message action rejects empty, non-text, and oversized messages", () => {
  if (buildResidentPublicWorldMessageAction("  ") !== null) throw new Error("empty message accepted");
  if (buildResidentPublicWorldMessageAction({ message: "not text" }) !== null) throw new Error("object accepted");
  if (buildResidentPublicWorldMessageAction("x".repeat(8001)) !== null) throw new Error("oversized message accepted");
});

Deno.test("public world message action removes transport control characters", () => {
  const action = buildResidentPublicWorldMessageAction("Hello\u0000\u0007 world");
  if (!action || action.message !== "Hello world") throw new Error("control characters were not removed");
});
