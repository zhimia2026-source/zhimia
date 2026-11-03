# ZHI Community Token Authentication Audit

**Audit date:** 2026-11-03  
**Target:** Supabase project `lvxmygrgqtmzqgailmyl`, Edge Function `zhi-community`  
**Status:** Existing authentication verified by source inspection; end-to-end caller test still pending.

## 1. Verified implementation

The deployed `zhi-community` function already authenticates personal tokens in its request handler:

1. Reads a bearer token from the Authorization header.
2. Rejects missing or oversized token values.
3. Computes SHA-256 and looks up `zhi_personal_access_tokens.token_hash`.
4. Rejects missing, revoked, or expired token rows.
5. Conditionally updates `last_used_at` only when `revoked_at IS NULL`; requires a returned row.
6. Derives `Actor.userId` and `Actor.capabilities` from the database row.
7. Does not accept owner identity from the request body as the authenticated actor.

The expiry and conditional-touch logic is extracted into `auth_helpers.ts`. Unit tests are provided in `auth_helpers_test.ts`.

## 2. Capability findings

A metadata-only query of token records found the currently active personal token record has health-related capabilities only:

- `health.chat`
- `health.history.read`
- `health.consent.manage`

It does not include the community capabilities required by selected read/join/messaging routes, including:

- `community.scene.discover`
- `community.scene.enter`
- `community.message.read`
- `community.message.send`
- `community.scene.invite`
- `agent.memory.read`

Therefore, successful token authentication does **not** imply authorization for community operations. Routes guarded by these capabilities should return 403 until an appropriately scoped token grant is issued. Do not silently broaden a personal token's privileges during deployment.

## 3. Authorization gaps to close before public rollout

Source review found that the current `POST /v1/scenes` and `POST /v1/agents` creation routes authenticate the token and derive ownership from `actor.userId`, but do not currently check a dedicated create capability. Before opening these routes to broader use, introduce explicit least-privilege capabilities (for example `community.scene.create` and `community.agent.create`) and update token issuance/grant administration to support them with an owner-controlled workflow.

Do not infer authorization from token validity alone. Keep resource ownership checks, world membership checks, and per-action capability checks separate.

## 4. Repository source backup

The deployed Edge Function source has been backed up into this repository:

- `supabase/functions/zhi-community/index.ts`
- `supabase/functions/zhi-community/auth_helpers.ts`
- `supabase/functions/zhi-community/access_helpers.ts`
- `supabase/functions/zhi-community/ontology_helpers.ts`
- `supabase/functions/zhi-community/cognitive_cycle_helpers.ts`
- `supabase/functions/zhi-community/chat_context_helpers.ts`
- `supabase/functions/zhi-community/environment_helpers.ts`
- `supabase/functions/zhi-community/auth_helpers_test.ts`

This is a source backup, not a redeployment. The live function was not changed by this audit.

## 5. Required acceptance tests

- Missing, malformed, expired, and revoked tokens return 401.
- Active token identity is derived only from the token row.
- A request body containing a forged `owner_user_id` cannot change ownership.
- Health-only token cannot discover/join/message in a community route requiring community capability.
- Token with only `community.scene.discover` cannot create scenes, invite members, read private memories, or send messages.
- Token with create capability can create a world, and the RPC records the token-derived actor as creator.
- Revocation between token lookup and conditional touch fails closed.
- User A cannot read User B's agents, cognition, chat history, or private memories.

## 6. Deployment rule

Do not deploy changes to the live `zhi-community` function until source backup, unit tests, route-level authorization tests, and a rollback version are ready. Do not add community capabilities to an existing personal token without explicit owner approval.
