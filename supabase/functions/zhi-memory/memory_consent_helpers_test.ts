import { hasVerifiedAgentMemoryConsent, isMemoryTokenExpiryValid } from "./memory_consent_helpers.ts";

const request = {
  agent_id: "mia",
  owner_user_id: "owner-1",
  requester_user_id: "owner-1",
  purpose: "memory.history.read",
  scope: "memory.full",
  now: Date.parse("2029-01-01T00:00:00Z"),
};
const consent = {
  agent_id: "mia",
  owner_user_id: "owner-1",
  grantee_kind: "user" as const,
  grantee_id: "owner-1",
  purpose: "memory.history.read",
  scopes: ["memory.full"],
  expires_at: "2029-01-02T00:00:00Z",
  revoked_at: null,
  consent_event_id: "event-1",
  attestation_verified: true,
};

Deno.test("owner identity alone never grants private memory access", () => {
  if (hasVerifiedAgentMemoryConsent(null, request)) throw new Error("consent required");
});

Deno.test("private memory requires exact verified Agent consent", () => {
  if (!hasVerifiedAgentMemoryConsent(consent, request)) throw new Error("valid consent expected");
  if (hasVerifiedAgentMemoryConsent({ ...consent, attestation_verified: false }, request)) {
    throw new Error("unverified attestation must be denied");
  }
  if (hasVerifiedAgentMemoryConsent({ ...consent, revoked_at: "2029-01-01T01:00:00Z" }, request)) {
    throw new Error("revoked consent must be denied");
  }
  if (hasVerifiedAgentMemoryConsent({ ...consent, scopes: ["memory.summary"] }, request)) {
    throw new Error("scope mismatch must be denied");
  }
});


Deno.test("memory token expiry fails closed for malformed and elapsed values", () => {
  const now = Date.parse("2026-11-20T00:00:00.000Z");
  if (!isMemoryTokenExpiryValid(null, now)) throw new Error("null expiry is non-expiring");
  if (!isMemoryTokenExpiryValid("2026-11-21T00:00:00.000Z", now)) throw new Error("future expiry should pass");
  for (const value of ["", "not-a-date", "2026-11-19T00:00:00.000Z"]) {
    if (isMemoryTokenExpiryValid(value, now)) throw new Error("invalid or elapsed expiry must fail closed: " + value);
  }
});
