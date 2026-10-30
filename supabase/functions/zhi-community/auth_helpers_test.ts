import { tokenHasCapability, tokenTouchSucceeded } from "./auth_helpers.ts";

Deno.test("accepts token only when active-token touch returns a row", () => {
  if (!tokenTouchSucceeded({ data: { id: "token-1" }, error: null })) {
    throw new Error("expected a successful active-token update to pass");
  }
});

Deno.test("rejects token when conditional update matches no row", () => {
  if (tokenTouchSucceeded({ data: null, error: null })) {
    throw new Error("expected a revoked or missing token row to be rejected");
  }
});

Deno.test("rejects token when token touch reports a database error", () => {
  if (tokenTouchSucceeded({ data: null, error: new Error("database unavailable") })) {
    throw new Error("expected database errors to reject authentication");
  }
});

Deno.test("rejects token when update result contains both data and an error", () => {
  if (tokenTouchSucceeded({ data: { id: "token-1" }, error: new Error("partial failure") })) {
    throw new Error("expected any update error to reject authentication");
  }
});

Deno.test("community capability scopes are independent", () => {
  const scopes = ["community.scene.discover", "community.message.send"];
  if (!tokenHasCapability(scopes, "community.scene.discover")) {
    throw new Error("scene discovery scope should be accepted");
  }
  if (!tokenHasCapability(scopes, "community.message.send")) {
    throw new Error("message send scope should be accepted");
  }
  if (tokenHasCapability(scopes, "community.message.read")) {
    throw new Error("message send must not imply message read");
  }
  if (tokenHasCapability(scopes, "community.scene.create")) {
    throw new Error("discovery must not imply scene creation");
  }
});

Deno.test("missing or malformed community capabilities fail closed", () => {
  if (tokenHasCapability(null, "community.scene.enter")) {
    throw new Error("missing capabilities must be denied");
  }
  if (tokenHasCapability("community.scene.enter", "community.scene.enter")) {
    throw new Error("string capabilities must be denied");
  }
  if (tokenHasCapability([], "community.scene.enter")) {
    throw new Error("empty capability list must be denied");
  }
});
