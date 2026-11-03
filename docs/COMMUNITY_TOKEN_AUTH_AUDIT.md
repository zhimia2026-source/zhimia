# ZHI Community Token Authentication Audit

**Audit date:** 2026-11-03  
**Target:** Supabase project `lvxmygrgqtmzqgailmyl`, Edge Function `zhi-community`  
**Status:** Token capability grant applied; creation gates deployed; authenticated end-to-end acceptance remains pending.

## 1. Verified implementation

The deployed `zhi-community` function authenticates personal tokens in its request handler:

1. Reads a bearer token from the Authorization header.
2. Rejects missing or oversized token values.
3. Computes SHA-256 and looks up `zhi_personal_access_tokens.token_hash`.
4. Rejects missing, revoked, or expired token rows.
5. Conditionally updates `last_used_at` only when `revoked_at IS NULL`; requires a returned row.
6. Derives `Actor.userId` and `Actor.capabilities` from the database row.
7. Does not accept owner identity from the request body as the authenticated actor.

The expiry, conditional-touch, and exact capability-match logic is in `auth_helpers.ts`. Unit tests are in `auth_helpers_test.ts`.

## 2. Capability grant applied

After the creator explicitly approved the grant, the sole active, non-revoked personal token was updated additively. Existing health capabilities and its original expiry were preserved.

Added capabilities:

- `community.scene.create`
- `community.scene.discover`
- `community.scene.enter`
- `community.scene.invite`
- `community.agent.create`
- `community.message.read`
- `community.message.send`
- `agent.memory.read`

The token's existing health capabilities remain:

- `health.chat`
- `health.history.read`
- `health.consent.manage`

The database capability allowlist was extended through migration `20261103035119_allow_community_agent_create_capability`. The token's expiry was not changed. No raw token or token hash was written to this document.

## 3. Creation-route authorization

The live `zhi-community` function is now version 3.

- `POST /v1/scenes` requires `community.scene.create`.
- `POST /v1/agents` requires `community.agent.create`.
- Missing capability returns HTTP 403 with `capability_required`.
- Ownership continues to derive from the authenticated token row's `user_id`, not request-body owner fields.

The helper performs an exact capability match and fails closed when capabilities are absent.

## 4. Repository source backup

The deployed Edge Function source is backed up in this repository:

- `supabase/functions/zhi-community/index.ts`
- `supabase/functions/zhi-community/auth_helpers.ts`
- `supabase/functions/zhi-community/access_helpers.ts`
- `supabase/functions/zhi-community/ontology_helpers.ts`
- `supabase/functions/zhi-community/cognitive_cycle_helpers.ts`
- `supabase/functions/zhi-community/chat_context_helpers.ts`
- `supabase/functions/zhi-community/environment_helpers.ts`
- `supabase/functions/zhi-community/auth_helpers_test.ts`
- `supabase/migrations/20261103035119_allow_community_agent_create_capability.sql`

The previous deployed source (version 2) is preserved in GitHub history and can be used as a rollback reference. Current deployment version 3 was deployed after the source backup and helper test file were committed.

## 5. Acceptance tests still required

- Missing, malformed, expired, and revoked tokens return 401.
- Active token identity is derived only from the token row.
- A request body containing a forged `owner_user_id` cannot change ownership.
- A token without `community.scene.create` cannot create scenes.
- A token without `community.agent.create` cannot create agents.
- A token with only `community.scene.discover` cannot create scenes, invite members, read private memories, or send messages.
- The granted token can create a world and the RPC records the token-derived actor as creator.
- Revocation between token lookup and conditional touch fails closed.
- User A cannot read User B's agents, cognition, chat history, or private memories.

These authenticated HTTP tests have not yet been run because the raw personal token is intentionally not exposed to this workflow. No raw token is requested or recorded.

## 6. Deployment and rollback

Current live deployment: `zhi-community` version 3, `verify_jwt=false` (the function performs its own personal-token authentication).

Rollback reference: prior version 2 source in GitHub history. Any rollback must be deliberate and followed by a token-permission review, because the version 2 create routes did not enforce the two dedicated creation capabilities.


## 7. Frontend session reuse (source committed; live verification pending)

The repository now contains:
- `web/zhi-universe.html`: controlled initialization page for the first private world and resident.
- `web/zhi-universe-client.js`: reuses the existing `zhi_personal_token` and `zhi_refresh_token` sessionStorage keys and refreshes through the existing Token Gateway.
- `web/zhi-health-advisor.html`: same-tab navigation link to the Universe entry.
- `.github/workflows/health-advisor-pages.yml`: copies the new page/client into the Pages artifact and includes both in the client-side secret scan.

The page does not display or log raw credentials. It only creates resources after an explicit creator click, first looks up existing owner-scoped resources, and uses the private Agent invitation/redeem routes to establish membership.

Not yet verified: successful GitHub Pages deployment, actual page load in the user's authenticated browser tab, real Token Gateway refresh behavior from this new page, HTTP acceptance of the create/invitation flow, or creation of the Aurora/Lumen records. No world or Agent was created by this commit.
