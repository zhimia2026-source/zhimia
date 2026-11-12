# ZHI Agent Consent Attestation Gateway

This function is a proposed trusted issuance boundary. It is **not deployed** and must not be enabled until the paired database proposal is reviewed, replay-tested, and the two matching HMAC secrets are provisioned independently.

## Request contract

POST one JSON envelope:

```json
{
  "key_id": "runtime-key-2026-01",
  "algorithm": "Ed25519",
  "signature": "<base64url 64-byte signature>",
  "payload": {
    "agent_id": "<uuid>",
    "owner_user_id": "<uuid>",
    "proposal_id": null,
    "grantee_kind": "agent_runtime",
    "grantee_id": "runtime-instance-id",
    "purpose": "memory.history.read",
    "scopes": ["memory.read"],
    "content_sha256": "<lowercase sha256 hex>",
    "based_on_version": 0,
    "consent_event_id": "<uuid>",
    "nonce": "<base64url 32 random bytes>",
    "issued_at": "2026-11-12T02:00:00.000Z",
    "expires_at": "2026-11-12T03:00:00.000Z"
  }
}
```

The Agent Runtime signs UTF-8 bytes of canonical JSON (recursive lexicographic object-key ordering, no insignificant whitespace) for:

```json
{"domain":"ZHI_AGENT_CONSENT_V1","key_id":"...","payload":{...}}
```

The gateway looks up an active, owner- and agent-bound Ed25519 public key; validates the exact payload schema, key validity, identity binding, time window, scopes, content hash, and signature; then sends an HMAC-authenticated issuance request to the database RPC. The HMAC secret is a separate server-only secret and is never returned to callers.

## Required deployment configuration

- `ZHI_ATTESTATION_DB_HMAC_SECRET`: at least 32 random bytes, stored as an Edge Function secret.
- The exact same secret must be inserted by an administrator into the private database secret table created by the paired SQL proposal. Never commit it or expose it to Agent clients.
- Provision runtime public keys through an administrator-only workflow. No public key registration endpoint is included in this phase.
- Configure `verify_jwt = false` only because the function performs cryptographic Runtime authentication and the database HMAC trust handoff itself. Do not expose the HMAC secret to clients.

## Security behavior

- Ed25519 only; no algorithm negotiation or fallback.
- Strict allow-list payload fields; canonical serialization; SHA-256 content hash.
- 32-byte random nonce; database uniqueness enforces one-time use.
- 60-second clock skew; maximum consent lifetime 24 hours.
- Expiry and key validity are checked in the gateway and rechecked by SQL.
- The SQL RPC alone may insert verified rows; direct `service_role` INSERT is revoked.
- The SQL RPC verifies the gateway HMAC, consumes the nonce transactionally, and inserts `attestation_verified = true`.
- Revocation and expiry remain enforced by existing read gates; this gateway does not broaden any read scope.

Do not deploy this function until the SQL proposal has been transformed into a CLI-generated migration, reviewed against the live schema, replayed on a disposable project, and all negative tests pass.
