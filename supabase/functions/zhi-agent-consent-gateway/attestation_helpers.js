const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX_256_RE = /^[0-9a-f]{64}$/;
const B64URL_RE = /^[A-Za-z0-9_-]+$/;
const MAX_LIFETIME_MS = 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 60 * 1000;

export function canonicalJson(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non_finite_number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new Error("non_plain_object");
    const keys = Object.keys(value).sort();
    return "{" + keys.map((key) => JSON.stringify(key) + ":" + canonicalJson(value[key])).join(",") + "}";
  }
  throw new Error("unsupported_json_value");
}

function decodeBase64Url(value) {
  if (typeof value !== "string" || !B64URL_RE.test(value)) throw new Error("invalid_base64url");
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function isNonEmptyText(value, max = 256) {
  return typeof value === "string" && value.length > 0 && value.length <= max &&
    value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
}

export function validateConsentPayload(payload, nowMs = Date.now()) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("invalid_payload");
  const required = [
    "agent_id", "owner_user_id", "proposal_id", "grantee_kind", "grantee_id",
    "purpose", "scopes", "content_sha256", "based_on_version", "consent_event_id",
    "nonce", "issued_at", "expires_at",
  ];
  if (Object.keys(payload).sort().join("|") !== required.slice().sort().join("|")) throw new Error("unexpected_payload_fields");
  if (!UUID_RE.test(payload.agent_id) || !UUID_RE.test(payload.owner_user_id)) throw new Error("invalid_identity_binding");
  if (payload.proposal_id !== null && !UUID_RE.test(payload.proposal_id)) throw new Error("invalid_proposal_id");
  if (!["user", "agent", "governance_service"].includes(payload.grantee_kind) ||
      !isNonEmptyText(payload.grantee_id, 200)) throw new Error("invalid_grantee");
  if (!isNonEmptyText(payload.purpose, 200) || !/^[a-z][a-z0-9._:-]*$/.test(payload.purpose)) throw new Error("invalid_purpose");
  if (!Array.isArray(payload.scopes) || payload.scopes.length < 1 || payload.scopes.length > 30) throw new Error("invalid_scopes");
  if (payload.scopes.some((scope) => !isNonEmptyText(scope, 128) || !/^[a-z][a-z0-9._:-]*$/.test(scope))) throw new Error("invalid_scope");
  if (new Set(payload.scopes).size !== payload.scopes.length || payload.scopes.join("|") !== [...payload.scopes].sort().join("|")) throw new Error("scopes_must_be_sorted_unique");
  if (payload.proposal_id === null) {
    if (payload.content_sha256 !== null || payload.based_on_version !== null) throw new Error("proposal_binding_fields_must_be_null");
  } else {
    if (typeof payload.content_sha256 !== "string" || !HEX_256_RE.test(payload.content_sha256) ||
        !Number.isSafeInteger(payload.based_on_version) || payload.based_on_version < 1) {
      throw new Error("invalid_proposal_binding");
    }
    if (payload.grantee_kind !== "governance_service" || payload.grantee_id !== "zhi-community" ||
        payload.purpose !== "cognition.revision.apply" || !payload.scopes.includes("cognition.revision.apply")) {
      throw new Error("invalid_revision_consent_grantee");
    }
  }
  if (!UUID_RE.test(payload.consent_event_id)) throw new Error("invalid_consent_event_id");
  const nonce = decodeBase64Url(payload.nonce);
  if (nonce.length !== 32) throw new Error("invalid_nonce");
  const issuedAt = Date.parse(payload.issued_at);
  const expiresAt = Date.parse(payload.expires_at);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) throw new Error("invalid_consent_time");
  if (issuedAt > nowMs + CLOCK_SKEW_MS || issuedAt < nowMs - MAX_LIFETIME_MS) throw new Error("issued_at_out_of_range");
  if (expiresAt <= nowMs || expiresAt <= issuedAt || expiresAt - issuedAt > MAX_LIFETIME_MS) throw new Error("consent_expired_or_too_long");
  return { nonceBytes: nonce, issuedAt, expiresAt };
}

export async function verifyConsentEnvelope(envelope, registeredKey, nowMs = Date.now()) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) throw new Error("invalid_envelope");
  const { key_id, algorithm, signature, payload } = envelope;
  if (!isNonEmptyText(key_id, 128) || algorithm !== "Ed25519" || typeof signature !== "string") throw new Error("invalid_attestation_header");
  if (!registeredKey || registeredKey.key_id !== key_id || registeredKey.algorithm !== "Ed25519") throw new Error("unregistered_runtime_key");
  if (registeredKey.revoked_at || !registeredKey.is_active) throw new Error("runtime_key_revoked");
  const validFrom = Date.parse(registeredKey.valid_from);
  const validUntil = registeredKey.valid_until ? Date.parse(registeredKey.valid_until) : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(validFrom) || nowMs < validFrom || nowMs >= validUntil) throw new Error("runtime_key_outside_validity");
  const { issuedAt, expiresAt } = validateConsentPayload(payload, nowMs);
  if (payload.agent_id !== registeredKey.agent_id || payload.owner_user_id !== registeredKey.owner_user_id) throw new Error("runtime_identity_mismatch");
  if (issuedAt < validFrom || expiresAt > validUntil) throw new Error("consent_outside_key_validity");
  const publicKey = await crypto.subtle.importKey("jwk", registeredKey.public_jwk, { name: "Ed25519" }, false, ["verify"]);
  const signedBytes = new TextEncoder().encode(canonicalJson({ domain: "ZHI_AGENT_CONSENT_V1", key_id, payload }));
  const signatureBytes = decodeBase64Url(signature);
  if (signatureBytes.length !== 64) throw new Error("invalid_signature_length");
  const valid = await crypto.subtle.verify({ name: "Ed25519" }, publicKey, signatureBytes, signedBytes);
  if (!valid) throw new Error("invalid_runtime_signature");
  return { payloadText: canonicalJson(payload), issuedAt, expiresAt };
}

export async function createGatewayMac(payloadText, keyId, signature, secret) {
  if (typeof secret !== "string" || new TextEncoder().encode(secret).length < 32) throw new Error("gateway_hmac_secret_too_short");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const message = new TextEncoder().encode(payloadText + "." + keyId + "." + signature);
  const mac = await crypto.subtle.sign("HMAC", key, message);
  return [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
