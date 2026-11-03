import { DEFAULT_PERSONAL_TOKEN_CAPABILITIES } from "./capabilities.ts";

Deno.test("new personal tokens can discover and enter shared worlds", () => {
  for (const required of [
    "community.scene.discover",
    "community.scene.enter",
    "community.agent.create",
    "community.message.read",
    "community.message.send",
  ]) {
    if (!DEFAULT_PERSONAL_TOKEN_CAPABILITIES.includes(required as never)) {
      throw new Error("missing safe community capability: " + required);
    }
  }
});

Deno.test("new personal tokens do not receive governance or private-memory privileges", () => {
  for (const forbidden of [
    "community.scene.create",
    "community.scene.invite",
    "agent.memory.read",
    "agent.memory.write",
    "agent.memory.approve",
    "agent.memory.delete",
    "tool.execute",
  ]) {
    if (DEFAULT_PERSONAL_TOKEN_CAPABILITIES.includes(forbidden as never)) {
      throw new Error("unexpected privileged capability: " + forbidden);
    }
  }
});

Deno.test("default token scopes remain below the database cardinality ceiling", () => {
  if (DEFAULT_PERSONAL_TOKEN_CAPABILITIES.length > 12) {
    throw new Error("default capability count exceeds database limit");
  }
});
