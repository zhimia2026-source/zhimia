# ZHI Community Security Review — MVP Gate

Date: 2026-10-30
Branch: `feature/intelligent-community-mvp-clean`

This review records source-level findings and CI evidence. It does not certify production deployment.

## Confirmed design boundaries

- Community requests authenticate a ZHI personal access token by hashing the presented bearer token and looking up its hash in `zhi_personal_access_tokens`.
- The community migration removes direct table privileges from `anon` and `authenticated`; browser requests are intended to use the server-side Edge Function.
- Private-scene invitations use server-only RPCs. The plaintext invitation token is returned once; only its hash is stored.
- Scene message reads are limited to open `members` conversations and require active scene membership plus `message:read`.
- Private conversations are excluded from the current message endpoints. Do not enable private chat until each read/write checks active conversation membership, active scene membership, expiry, and the relevant capability.
- Scene creation writes the scene and owner membership atomically.
- A unique partial index enforces at most one open group conversation per scene.
- Private cognition read/write routes check the authenticated owner and agent pair. Feedback appends a separate observation record without modifying its hypothesis. Revision proposals link only same-owner/same-agent feedback through composite foreign keys and remain pending owner review.
- Cognition approvals and rollbacks append new immutable versions; prior records are retained. The human decision note is persisted as `change_note` on the appended version.

## Verified CI evidence

- GitHub Actions run [41018840204](https://github.com/zhimia2026-source/zhimia/actions/runs/41018840204), code commit `8ef6728a704a6125b261fed238b83cc7e37a4368`, passed:
  - Edge Function type-check and Deno route/helper tests, including two-owner private cognition read-isolation tests.
  - Disposable PostgreSQL migration smoke tests across the community core, private cognition, revision proposal, revision decision, and change-note audit migrations.
  - Edge safety tests and Python tests.
- The two-owner cognition test is a mocked HTTP/API-level test. It verifies that owner A reads only A's cognition, owner B cannot discover A's agent (404, with no cognition-table query), and owner B reads only B's partition.
- This is **not** a real two-account Supabase Auth + personal-token HTTP end-to-end test. The SQL migrations are tested against disposable PostgreSQL in CI, not against the configured live Supabase project.
- A later documentation-only commit `6c4427f452be0ea1fdbc85a1353f3a5674923c3a` updated API documentation after the cited code CI run; it did not change executable code. Documentation/OpenAPI validation is being added to CI separately.

## Latest private chat CI evidence

- GitHub Actions run [41031915086](https://github.com/zhimia2026-source/zhimia/actions/runs/41031915086), commit `c127ddd828a22feb40b42dd44d111ab5b2eeba46`, passed:
  - Edge Function type-check and private chat route tests.
  - Chat-context tests proving owner+agent filtering, rejecting another owner's agent, rejecting a different agent under the same owner, and excluding scene-message queries from private chat context.
  - Disposable PostgreSQL application of the new private chat migration, plus SQL checks for RLS, browser-role denial, composite owner/agent binding, and idempotency uniqueness.
  - OpenAPI and workflow YAML syntax validation.
- The model provider is mocked in CI. No real provider key or external model request is used in CI.
- This remains mocked route-level and disposable-database evidence, not real Supabase Auth / two-account HTTP E2E.


- Follow-up GitHub Actions run [41032468164](https://github.com/zhimia2026-source/zhimia/actions/runs/41032468164), branch head `a64a8dfa80a53932970f174b0d187f1845f6bcc6`, also passed. It additionally validates the private chat page's embedded JavaScript syntax and static security contract (personal token in sessionStorage; no legacy broadcast/Core references or server secrets in the page).


- GitHub Actions run [41033336226](https://github.com/zhimia2026-source/zhimia/actions/runs/41033336226), commit `8f48925135f1d6c54be5dc3d1dbfd98158d84900`, passed all three jobs. It adds private-chat context hardening:
  - The model prompt now receives only agent display name/role, not arbitrary `public_manifest` content.
  - Cognition context is limited to 12 records; state and evidence text are bounded.
  - Conversation replay is limited to the latest 8 completed turns, with each user/assistant message capped at 2,500 characters.
  - Prompt-injection-like strings in stored cognition are tested as untrusted data; context and history limits have dedicated unit tests.
  - Edge Function type-check, route isolation tests, disposable PostgreSQL migration smoke tests, OpenAPI/workflow validation, and static chat-page checks all pass.


## Live Supabase read-only snapshot (2026-10-30)

Target project `lvxmygrgqtmzqgailmyl` was inspected without making changes:
- Project is `ACTIVE_HEALTHY`, region `ap-southeast-1`, PostgreSQL 17.
- Live migration history currently contains only health-advisor, personal-token/refresh-credential, and ZHI Care migrations. No ZHI Community/private cognition/private chat migrations are present.
- Live Edge Functions are `zhi-health-advisor`, `zhi-token-gateway`, `zhi-token-admin`, and `zhi-care`. No `zhi-community` function is deployed.
- The live public schema has no `zhi_agents`, `zhi_worlds`, `zhi_agent_cognition_records`, or `zhi_agent_chat_turns` tables.
- A read-only privilege query confirmed that `anon` and `authenticated` have no direct privileges on the inspected token, refresh-credential, and Care tables; `service_role` has the server-side privileges. Supabase Advisor's “RLS enabled, no policy” findings on these tables are consistent with this service-only access model; do not resolve them by granting browser access.
- Supabase Advisor also warns that leaked-password protection is disabled. This setting has not been changed.
- No production migration, permission change, Edge Function deployment, or Auth setting change was performed.


- GitHub Actions run [41034331621](https://github.com/zhimia2026-source/zhimia/actions/runs/41034331621), commit `8cbd48e92e2f98009f8f1fbb59c72affa948b584`, passed all jobs after adding the authenticated `GET /v1/scenes/mine` route and community scene lobby. It covers active owner/member scene listing, expiry filtering, and verifies the UI scripts for both private chat and community scene pages.

## Required before production

1. **Real cross-account isolation:** use two real test accounts and tokens against an isolated Supabase test project. Prove account A cannot read account B's cognition or private conversation, redeem an invitation targeted to B, or use a revoked/expired token. Include negative tests for wrong agent IDs and inactive memberships.
2. **Chat context boundary:** the current private-chat context builder filters by authenticated `owner_user_id` and selected `agent_id`, bounds cognition/history, and excludes scene messages. Before release, add a real Supabase two-account HTTP E2E proof that these boundaries hold against deployed storage; never silently persist scene messages as private cognition.
3. **Idempotency concurrency:** simultaneous duplicate requests may receive a conflict rather than a replay response. Confirm client retry behavior and add a concurrency test.
4. **Deployment settings:** verify `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ZHI_ALLOWED_ORIGINS`, and the Edge Function gateway JWT setting. If gateway JWT verification is disabled for the custom ZHI token, the function's own token validation must remain mandatory.
5. **Migration and rollback:** review and back up the target project before applying migrations; run smoke tests before any traffic cutover.
6. **Contract parity:** validate the OpenAPI document and review that each documented route, parameter, request body, and response matches the deployed Edge Function implementation.

## Release gate

Do not describe the community as production-ready until real cross-account authorization tests pass, current-commit CI is green, and the migration/function have been deployed and smoke-tested in the intended Supabase project.

## Not implemented or not yet verified in this slice

- The community and agent-scene feature branch is CI-tested but not deployed; run real two-account HTTP E2E before release.
- Private agent chat is implemented on the feature branch and CI-tested, but is not deployed or verified against a real model provider.
- Invitation revocation endpoint.
- Approval queue workflow.
- Realtime delivery.
- Cross-cloud signed identity, federation, and audience validation.
- Persistent task execution and trusted tool invocation.
- Real Supabase two-account HTTP end-to-end isolation tests.
- Any access to private intelligent-person memories from shared scene context.
