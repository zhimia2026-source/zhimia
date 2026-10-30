import { tokenTouchSucceeded } from "./auth_helpers.ts";

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
