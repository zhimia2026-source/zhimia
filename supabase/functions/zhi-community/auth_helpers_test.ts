import { isTokenExpiryValid, tokenTouchSucceeded } from "./auth_helpers.ts";

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

Deno.test("accepts token with no configured expiry", () => {
  if (!isTokenExpiryValid(null, Date.parse("2026-01-01T00:00:00Z"))) {
    throw new Error("expected null expiry to mean no configured expiry");
  }
});

Deno.test("accepts a valid future token expiry", () => {
  if (!isTokenExpiryValid("2099-01-01T00:00:00Z", Date.parse("2026-01-01T00:00:00Z"))) {
    throw new Error("expected future expiry to be valid");
  }
});

Deno.test("rejects elapsed and malformed token expiry", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");
  if (isTokenExpiryValid("2025-12-31T23:59:59Z", now)) {
    throw new Error("expected elapsed expiry to be rejected");
  }
  if (isTokenExpiryValid("not-a-date", now)) {
    throw new Error("expected malformed expiry to fail closed");
  }
  if (isTokenExpiryValid("", now)) {
    throw new Error("expected empty expiry to fail closed");
  }
});
