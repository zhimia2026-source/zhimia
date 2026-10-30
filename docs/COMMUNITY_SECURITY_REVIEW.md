# ZHI Community Security Review — MVP Gate

Date: 2026-10-28
Branch: `feature/intelligent-community-mvp`

This review records source-level findings and release gates. It does not certify production deployment.

## Confirmed design boundaries

- Community requests authenticate a ZHI personal access token by hashing the presented bearer token and looking up its hash in `zhi_personal_access_tokens`.
- The community migration removes direct table privileges from `anon` and `authenticated`; browser requests are intended to use the server-side Edge Function.
- Private-scene invitations use server-only RPCs. The plaintext invitation token is returned once; only its hash is stored.
- Scene message reads are limited to open `members` conversations and require active scene membership plus `message:read`.
- Private conversations are excluded from the current message endpoints. Do not enable private chat until each read/write checks active conversation membership, active scene membership, expiry, and the relevant capability.
- Scene creation writes the scene and owner membership atomically.
- Public scene joins now use `zhi_join_public_world`, which serializes concurrent joins on the scene row and restores/returns a single active membership idempotently.
- Private scenes reject the public join RPC and require target-bound, one-time invitation redemption.
- A unique partial index enforces at most one open group conversation per scene.

## Required before production

1. **Token revocation race:** code fix committed in `e633363aaadcf1b7b03fd2d958daf947d50d3b45`; the authentication path now uses `auth_helpers.ts` to accept only a successful conditional update that returns a row. Regression cases were added in `auth_helpers_test.ts` for success, no matching row, database error, and mixed data/error. The GitHub Actions workflow now runs `deno test supabase/functions/zhi-community/auth_helpers_test.ts`; execution must still be confirmed on the latest head.
2. **Cross-account isolation:** prove that account A cannot read account B's private conversation, redeem an invitation targeted to B, or use a revoked/expired token.
3. **Idempotency concurrency:** simultaneous duplicate requests may receive a conflict rather than a replay response. Confirm client retry behavior and add a concurrency test.
4. **Deployment settings:** verify `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ZHI_ALLOWED_ORIGINS`, and the Edge Function gateway JWT setting. If gateway JWT verification is disabled for the custom ZHI token, the function's own token validation must remain mandatory.
5. **Migration and rollback:** review and back up the target project before applying the migration; run smoke tests before any traffic cutover.
6. **Latest CI:** verify CI for the latest branch head, not only earlier commits. The workflow now checks both Care adapters, community auth/member guards, public join idempotency, invitation target binding, single-use redemption, expiry, RPC grants, and migration rollback.

## Release gate

Do not describe the community as production-ready until cross-account authorization tests pass, current-commit CI is green, and the migration/function have been deployed and smoke-tested in the intended Supabase project.

## Not implemented in this slice

- Private one-to-one messaging
- Invitation revocation endpoint
- Approval queue workflow
- Realtime delivery
- Cross-cloud signed identity / federation
- Persistent task execution and tool invocation
- Scene temporal rhythms and event tides
- Any access to private intelligent-person memories
