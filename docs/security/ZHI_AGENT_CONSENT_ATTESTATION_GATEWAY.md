# ZHI Agent Consent Attestation Gateway — implementation proposal

Status: **implementation branch only; not deployed; no production schema changes**.

## Trust model

1. An Agent Runtime owns an Ed25519 private key. The private key never enters ZHI, Supabase, browser storage, logs, or this repository.
2. An administrator registers the Runtime's public JWK against one exact `agent_id` and `owner_user_id`. Public-key registration is deliberately not self-service in this phase.
3. The Runtime signs canonical JSON with domain separation `ZHI_AGENT_CONSENT_V1`.
4. The Edge Function verifies Ed25519 using WebCrypto, checks key status and exact identity binding, strict schema, time window, scopes, content hash, and expiry.
5. The Edge Function computes a second HMAC using a dedicated secret unavailable to other clients. The database verifies this HMAC before accepting issuance.
6. The database RPC rechecks key status and Agent ownership, binds revision consent to the exact persisted proposal hash and base version, consumes the nonce under a unique constraint, and inserts the consent row with `attestation_verified=true` in the same transaction.
7. Direct `service_role` INSERT on the consent table is revoked. Only the gateway RPC may create verified consent rows.

The HMAC is a service-to-database trust handoff; it does not replace the Runtime's Ed25519 signature. The database trusts the gateway only because the HMAC secret is provisioned in two protected locations and is not exposed to clients or ordinary Edge Functions.

## Existing production schema compatibility verified read-only

For current private-memory/cognition read gates, the grantee must be the owner user (`grantee_kind=user`, `grantee_id=owner_user_id)); the runtime signs that grant. The production consent table allows `grantee_kind` values `user`, `agent`, and `governance_service`; revision consents must use `governance_service / zhi-community / cognition.revision.apply`. Proposal-bound rows require both `content_sha256` and `based_on_version`, and the exact proposal hash is `zhi_cognition_revision_proposals.proposed_state_sha256`. Non-proposal consents require those two fields to be NULL. The draft payload and SQL now follow these constraints.

The live database has `pgcrypto` in schema `extensions`, and `zhi_agents(id, owner_user_id)` plus proposal columns used by the draft were confirmed by read-only introspection.

## Required secrets and key lifecycle

- Generate one independent random secret of at least 32 bytes for `ZHI_ATTESTATION_DB_HMAC_SECRET`.
- Store it as an Edge Function secret and separately in `zhi_security.gateway_secrets` using an administrator-only SQL session. Never place the value in GitHub, a migration, logs, chat, or a client app.
- Rotate by deploying a new gateway secret and atomically updating the database copy; document a short overlap/rotation procedure before production.
- Register only public Ed25519 JWKs. Require `kty=OKP`, `crv=Ed25519`, `x`, and forbid private `d`.
- Key revocation is immediate; old key material cannot be reactivated after revocation.

## Required negative tests

- Invalid Ed25519 signature and altered payload.
- Unknown, expired, or revoked key.
- Agent ID or owner ID mismatch.
- Content hash or base-version mismatch against the exact persisted proposal.
- Duplicate nonce / replay.
- Expired consent and expiry beyond key validity.
- Future-issued consent beyond clock skew.
- Wrong HMAC, absent HMAC secret, and direct service-role INSERT.
- Transaction rollback if consent insertion fails after nonce consumption.

## Integration gate

The SQL proposal now binds `proposal_id`, `content_sha256`, and `based_on_version` to the exact persisted proposal row. It deliberately does not mark the proposal as agent-consented; the existing proposal lifecycle must perform its own guarded transition after finding the verified consent row. This avoids a second, competing state transition.

## Verification / rollout

1. Generate the actual migration with the installed Supabase CLI in the repository workspace; this environment did not have the CLI installed, so the SQL is retained as a clearly marked proposal, not a migration.
2. Replay on a disposable Supabase project with the exact production schema snapshot.
3. Verify constraints, function ACLs, service-role direct insert denial, duplicate nonce atomicity, proposal binding, and existing consent read/revocation behavior.
4. Run the Node WebCrypto negative test suite and add SQL integration tests for all database-side conditions.
5. Run Supabase security advisors and CI.
6. Only after explicit approval, provision the two matching secrets, register the Runtime public keys, deploy the gateway, and verify production behavior.
7. Only after the above, consider connecting personality/cognition changes. PR #54 remains draft and must not be merged automatically.
