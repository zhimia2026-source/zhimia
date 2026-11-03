import { isTokenExpiryValid, tokenTouchSucceeded } from "./auth_helpers.ts";

Deno.test("missing token expiry is accepted as non-expiring", () => {
  if (!isTokenExpiryValid(null)) throw new Error("null expiry should be valid");
});

Deno.test("future token expiry is accepted", () => {
  const now = Date.parse("2026-11-03T00:00:00.000Z");
  if (!isTokenExpiryValid("2026-11-04T00:00:00.000Z", now)) {
    throw new Error("future expiry should be valid");
  }
});

Deno.test("elapsed and malformed token expiries fail closed", () => {
  const now = Date.parse("2026-11-03T00:00:00.000Z");
  if (isTokenExpiryValid("2026-11-02T00:00:00.000Z", now)) {
    throw new Error("elapsed expiry must be rejected");
  }
  if (isTokenExpiryValid("not-a-date", now)) {
    throw new Error("malformed expiry must be rejected");
  }
  if (isTokenExpiryValid("", now)) {
    throw new Error("empty expiry must be rejected");
  }
});

Deno.test("token touch succeeds only when an active row is returned", () => {
  if (!tokenTouchSucceeded({ data: { id: "token-id" }, error: null })) {
    throw new Error("returned active row should pass");
  }
  if (tokenTouchSucceeded({ data: null, error: null })) {
    throw new Error("missing row must fail closed");
  }
  if (tokenTouchSucceeded({ data: { id: "token-id" }, error: new Error("db") })) {
    throw new Error("database error must fail closed");
  }
});
