import { createClient } from "npm:@supabase/supabase-js@2";
import { canonicalJson, createGatewayMac, verifyConsentEnvelope } from "./attestation_helpers.js";

const MAX_BODY_BYTES = 16_384;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

function decodeHex(value: string) {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new Error("invalid_gateway_mac");
  return Uint8Array.from(value.match(/.{2}/g)!, (pair) => Number.parseInt(pair, 16));
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "attestation_failed";
  const allowed = new Set([
    "invalid_payload", "unexpected_payload_fields", "invalid_identity_binding", "invalid_proposal_id",
    "invalid_grantee", "invalid_purpose", "invalid_scopes", "invalid_scope", "scopes_must_be_sorted_unique",
    "invalid_content_hash", "invalid_base_version", "invalid_consent_event_id", "invalid_nonce",
    "invalid_consent_time", "issued_at_out_of_range", "consent_expired_or_too_long", "invalid_envelope",
    "invalid_attestation_header", "unregistered_runtime_key", "runtime_key_revoked",
    "runtime_key_outside_validity", "runtime_identity_mismatch", "consent_outside_key_validity",
    "invalid_signature_length", "invalid_runtime_signature", "gateway_hmac_secret_too_short",
  ]);
  return allowed.has(message) ? message : "attestation_failed";
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);
  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);

  let envelope: any;
  try { envelope = JSON.parse(raw); } catch { return json({ error: "invalid_json" }, 400); }
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) return json({ error: "invalid_envelope" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const gatewaySecret = Deno.env.get("ZHI_ATTESTATION_DB_HMAC_SECRET") ?? "";
  if (!supabaseUrl || !serviceKey || new TextEncoder().encode(gatewaySecret).length < 32) {
    return json({ error: "gateway_not_configured" }, 503);
  }

  try {
    const db = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { key_id, payload, signature } = envelope;
    if (typeof key_id !== "string" || !payload || typeof payload !== "object" || typeof signature !== "string") {
      return json({ error: "invalid_envelope" }, 400);
    }

    const { data: registeredKey, error: keyError } = await db.rpc("zhi_get_agent_runtime_signing_key", {
      p_key_id: key_id,
      p_agent_id: payload.agent_id,
      p_owner_user_id: payload.owner_user_id,
    });
    if (keyError || !registeredKey) return json({ error: "unregistered_runtime_key" }, 403);

    const verified = await verifyConsentEnvelope(envelope, registeredKey);
    const payloadText = canonicalJson(payload);
    if (payloadText !== verified.payloadText) return json({ error: "non_canonical_payload" }, 400);
    const gatewayMac = await createGatewayMac(payloadText, key_id, signature, gatewaySecret);

    const { data: consentId, error: issueError } = await db.rpc("zhi_issue_verified_agent_consent", {
      p_payload_text: payloadText,
      p_key_id: key_id,
      p_signature: signature,
      p_gateway_mac: gatewayMac,
    });
    if (issueError || !consentId) {
      // Unique nonce violations are deliberately indistinguishable from other issuance failures.
      return json({ error: "consent_issuance_rejected" }, 409);
    }
    return json({ ok: true, consent_id: consentId, consent_event_id: payload.consent_event_id, expires_at: payload.expires_at }, 201);
  } catch (error) {
    return json({ error: safeError(error) }, 403);
  }
});
