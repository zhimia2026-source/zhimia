import {
  hasCareActionCapability,
  isUsablePersonalToken,
  requiredCareCapability,
} from "./access_helpers.ts";

Deno.test("Care read actions require care.read", () => {
  for (const action of ["list", "get"]) {
    if (requiredCareCapability(action) !== "care.read") throw new Error(action);
    if (!hasCareActionCapability(["care.read"], action)) throw new Error(action);
  }
});

Deno.test("Care write actions require care.write", () => {
  for (const action of ["create", "request_approval", "transition", "add_evidence"]) {
    if (requiredCareCapability(action) !== "care.write") throw new Error(action);
    if (!hasCareActionCapability(["care.write"], action)) throw new Error(action);
  }
});

Deno.test("approval action requires separate care.approve capability", () => {
  if (requiredCareCapability("approve_action") !== "care.approve") {
    throw new Error("approve_action must require care.approve");
  }
  if (hasCareActionCapability(["care.write"], "approve_action")) {
    throw new Error("care.write must not imply care.approve");
  }
  if (!hasCareActionCapability(["care.approve"], "approve_action")) {
    throw new Error("care.approve must permit approval");
  }
});

Deno.test("unknown actions fail closed", () => {
  if (requiredCareCapability("admin") !== null) throw new Error("unknown action mapped");
  if (hasCareActionCapability(["care.write", "care.approve"], "admin")) {
    throw new Error("unknown action was authorized");
  }
});

Deno.test("token record expiry and revocation fail closed", () => {
  const now = Date.parse("2026-10-30T12:00:00.000Z");
  if (!isUsablePersonalToken({ revoked_at: null, expires_at: null }, now)) {
    throw new Error("non-expiring active token should be usable");
  }
  if (!isUsablePersonalToken({
    revoked_at: null, expires_at: "2026-10-30T12:01:00.000Z",
  }, now)) throw new Error("future expiry should be usable");
  if (isUsablePersonalToken({
    revoked_at: null, expires_at: "2026-10-30T11:59:00.000Z",
  }, now)) throw new Error("expired token accepted");
  if (isUsablePersonalToken({
    revoked_at: "2026-10-30T11:00:00.000Z", expires_at: null,
  }, now)) throw new Error("revoked token accepted");
  if (isUsablePersonalToken({ revoked_at: null, expires_at: "not-a-date" }, now)) {
    throw new Error("invalid expiry accepted");
  }
});
