# ZHI Community Security Review — MVP Gate

Date: 2026-10-30
Branch: `feature/intelligent-community-mvp-clean`

This review records source-level findings and release gates. It does not certify production deployment.

## Confirmed design boundaries

- Community requests authenticate a ZHI personal access token by hashing the presented bearer token and looking up its hash in `zhi_personal_access_tokens`.
- The community migration removes direct table privileges from `anon` and `authenticated`; browser requests are intended to use the server-side Edge Function.
- Private-scene invitations use server-only RPCs. The plaintext invitation token is returned once; only its hash is stored.
- Scene message reads are limited to open `members` conversations and require active scene membership plus `message:read`.
- Private conversations are excluded from the current message endpoints. Do not enable private chat until each read/write checks active conversation membership, active scene membership, expiry, and the relevant capability.
- Scene creation writes the scene and owner membership atomically.
- A unique partial index enforces at most one open group conversation per scene.
- Private cognition read/write routes check the authenticated owner and agent pair; the feedback route additionally requires an owned hypothesis and appends a separate observation record without modifying the hypothesis. Revision proposals are stored separately, link only same-owner/same-agent feedback through composite foreign keys, and remain shadow-proposed pending owner review.

## Required before production

1. **Token revocation race:** code fix committed in `e633363aaadcf1b7b03fd2d958daf947d50d3b45`; the authentication path now uses `auth_helpers.ts` to accept only a successful conditional update that returns a row. Regression cases are included in `auth_helpers_test.ts` and passed in the latest verified run.
2. **Cross-account isolation:** prove that account A cannot read account B's private conversation, redeem an invitation targeted to B, or use a revoked/expired token.
3. **Idempotency concurrency:** simultaneous duplicate requests may receive a conflict rather than a replay response. Confirm client retry behavior and add a concurrency test.
4. **Deployment settings:** verify `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ZHI_ALLOWED_ORIGINS`, and the Edge Function gateway JWT setting. If gateway JWT verification is disabled for the custom ZHI token, the function's own token validation must remain mandatory.
5. **Migration and rollback:** review and back up the target project before applying the migration; run smoke tests before any traffic cutover.
6. **Latest CI:** GitHub Actions run `41013979071` on commit `e83d81be49f9f874f9278277b637bfbeb53753e3` passed Edge Function typecheck/tests (including the new private cognition feedback route tests) and applied both community and private-cognition migrations to disposable PostgreSQL; SQL smoke tests passed. This validates the migration in CI, not the live Supabase project. Run URL: https://github.com/zhimia2026-source/zhimia/actions/runs/41013979071

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
- Owner approval/rejection and immutable version/rollback APIs (proposal persistence is implemented; decisions are not)
- Real Supabase two-account HTTP end-to-end isolation tests
- Any access to private intelligent-person memories
