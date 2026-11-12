import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { canonicalJson, createGatewayMac, verifyConsentEnvelope } from "./attestation_helpers.js";


const now = Date.now();
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const b64url = (bytes) => Buffer.from(bytes).toString("base64url");
const payload = () => ({
  agent_id: uuid(1), owner_user_id: uuid(2), proposal_id: null,
  grantee_kind: "user", grantee_id: uuid(2),
  purpose: "memory.history.read", scopes: ["memory.read"],
  content_sha256: null, based_on_version: null,
  consent_event_id: uuid(4), nonce: b64url(webcrypto.getRandomValues(new Uint8Array(32))),
  issued_at: new Date(now).toISOString(), expires_at: new Date(now + 60_000).toISOString(),
});

async function fixture(overrides = {}) {
  const keys = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const publicJwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
  const p = { ...payload(), ...overrides };
  const keyId = "runtime-key-1";
  const signed = new TextEncoder().encode(canonicalJson({ domain: "ZHI_AGENT_CONSENT_V1", key_id: keyId, payload: p }));
  const signature = b64url(await crypto.subtle.sign({ name: "Ed25519" }, keys.privateKey, signed));
  const envelope = { key_id: keyId, algorithm: "Ed25519", signature, payload: p };
  const registeredKey = {
    key_id: keyId, algorithm: "Ed25519", public_jwk: publicJwk,
    agent_id: p.agent_id, owner_user_id: p.owner_user_id,
    is_active: true, revoked_at: null,
    valid_from: new Date(now - 10_000).toISOString(),
    valid_until: new Date(now + 3_600_000).toISOString(),
  };
  return { envelope, registeredKey };
}

test("accepts a correctly signed, identity-bound consent envelope", async () => {
  const { envelope, registeredKey } = await fixture();
  const result = await verifyConsentEnvelope(envelope, registeredKey, now);
  assert.equal(result.payloadText, canonicalJson(envelope.payload));
});

test("rejects a modified payload after signing", async () => {
  const { envelope, registeredKey } = await fixture();
  envelope.payload.purpose = "memory.history.write";
  await assert.rejects(() => verifyConsentEnvelope(envelope, registeredKey, now), /invalid_runtime_signature/);
});

test("rejects a key bound to a different Agent or owner", async () => {
  const { envelope, registeredKey } = await fixture();
  registeredKey.agent_id = uuid(99);
  await assert.rejects(() => verifyConsentEnvelope(envelope, registeredKey, now), /runtime_identity_mismatch/);
});

test("rejects revoked keys", async () => {
  const { envelope, registeredKey } = await fixture();
  registeredKey.revoked_at = new Date(now - 1).toISOString();
  await assert.rejects(() => verifyConsentEnvelope(envelope, registeredKey, now), /runtime_key_revoked/);
});

test("rejects expired consent", async () => {
  const { envelope, registeredKey } = await fixture({
    issued_at: new Date(now - 120_000).toISOString(),
    expires_at: new Date(now - 1_000).toISOString(),
  });
  await assert.rejects(() => verifyConsentEnvelope(envelope, registeredKey, now), /consent_expired_or_too_long/);
});

test("rejects duplicated or unsorted scopes", async () => {
  const { envelope, registeredKey } = await fixture({ scopes: ["z.scope", "a.scope"] });
  await assert.rejects(() => verifyConsentEnvelope(envelope, registeredKey, now), /scopes_must_be_sorted_unique/);
});

test("rejects a nonce that is not 32 bytes", async () => {
  const { envelope, registeredKey } = await fixture({ nonce: b64url(new Uint8Array(8)) });
  await assert.rejects(() => verifyConsentEnvelope(envelope, registeredKey, now), /invalid_nonce/);
});

test("rejects proposal fields without a proposal id", async () => {
  const { envelope, registeredKey } = await fixture({ content_sha256: "a".repeat(64), based_on_version: 2 });
  await assert.rejects(() => verifyConsentEnvelope(envelope, registeredKey, now), /proposal_binding_fields_must_be_null/);
});

test("gateway HMAC is deterministic and secret length is enforced", async () => {
  const mac = await createGatewayMac("{}", "key-1", "signature", "x".repeat(32));
  assert.match(mac, /^[0-9a-f]{64}$/);
  await assert.rejects(() => createGatewayMac("{}", "key-1", "signature", "short"), /gateway_hmac_secret_too_short/);
});

test("accepts a correctly scoped proposal-bound revision consent", async () => {
  const { envelope, registeredKey } = await fixture({
    proposal_id: uuid(5),
    grantee_kind: "governance_service",
    grantee_id: "zhi-community",
    purpose: "cognition.revision.apply",
    scopes: ["cognition.revision.apply"],
    content_sha256: "b".repeat(64),
    based_on_version: 7,
  });
  const result = await verifyConsentEnvelope(envelope, registeredKey, now);
  assert.equal(result.payloadText, canonicalJson(envelope.payload));
});

test("rejects owner-read consent addressed to another user", async () => {
  const { envelope, registeredKey } = await fixture({ grantee_id: uuid(77) });
  await assert.rejects(() => verifyConsentEnvelope(envelope, registeredKey, now), /non_proposal_consent_must_bind_owner_user/);
});

test("rejects proposal consent addressed to an arbitrary service", async () => {
  const { envelope, registeredKey } = await fixture({
    proposal_id: uuid(5), grantee_kind: "governance_service", grantee_id: "other-service",
    purpose: "cognition.revision.apply", scopes: ["cognition.revision.apply"],
    content_sha256: "b".repeat(64), based_on_version: 7,
  });
  await assert.rejects(() => verifyConsentEnvelope(envelope, registeredKey, now), /invalid_revision_consent_grantee/);
});

test("rejects unknown envelope fields", async () => {
  const { envelope, registeredKey } = await fixture();
  envelope.untrusted_hint = "must-not-be-accepted";
  await assert.rejects(() => verifyConsentEnvelope(envelope, registeredKey, now), /invalid_envelope_fields/);
});

test("rejects a revoked or expired Runtime key validity window", async () => {
  const { envelope, registeredKey } = await fixture();
  registeredKey.valid_until = new Date(now - 1).toISOString();
  await assert.rejects(() => verifyConsentEnvelope(envelope, registeredKey, now), /runtime_key_outside_validity/);
});

test("rejects a non-owner user grantee", async () => {
  const { envelope, registeredKey } = await fixture({ grantee_id: uuid(77) });
  await assert.rejects(() => verifyConsentEnvelope(envelope, registeredKey, now), /non_proposal_consent_must_bind_owner_user/);
});
