# ZHI Personal Token Login

## Design
- The web page exposes only a personal-token login. Email/password registration and login are removed from the UI.
- Each token maps to a distinct Supabase Auth user. Tokens are random 256-bit values prefixed with `zhi_live_`; only SHA-256 hashes are stored.
- The token gateway validates the token server-side on every request, checks expiry/revocation, and derives the user ID from the token row. It never accepts a user ID from the browser.
- The gateway handles chat, explicit chat-storage consent, history listing, message listing, and conversation deletion through the service-role client. Every data operation is scoped to the verified user ID.
- Tokens expire after a default 365 days (configurable up to 10 years) and can be revoked by token ID. The raw token is returned only once at creation.
- The token administration endpoint is protected by `ZHI_TOKEN_ADMIN_SECRET`; it must never be embedded in the website or committed to source control.
- The browser keeps the token in `sessionStorage` only. Logout clears it. A shared/global token must not be used.

## Supabase configuration
In Supabase Dashboard > Edge Functions > Secrets, set:
- `ZHI_TOKEN_ADMIN_SECRET`: generate a long random secret (at least 32 random bytes). Do not reuse the personal token or Agnes API key.
- `ZHI_ALLOWED_ORIGINS`: `https://zhimia2026-source.github.io` (the exact GitHub Pages origin).

Existing `AGNES_API_KEY`, `AGNES_BASE_URL`, and `ZHI_MODEL_NAME` are used by the gateway.

## Issue a token
POST to `https://lvxmygrgqtmzqgailmyl.supabase.co/functions/v1/zhi-token-admin` with header `Authorization: Bearer <ZHI_TOKEN_ADMIN_SECRET>` and JSON body:
```json
{"action":"create","label":"使用者 A","expires_in_days":365}
```
The response includes `token`, `token_id`, and `expires_at`. Deliver the raw token privately to that person; do not save it in GitHub or logs. The service creates an internal Auth identity with a random password, so the user does not need email login.

## Revoke a token
POST the same endpoint with:
```json
{"action":"revoke","token_id":"<token_id returned at issuance>"}
```
The token is rejected on the next request.

## Verification checklist
- A valid token can call `action: login`.
- Missing, wrong, expired, and revoked tokens return 401.
- User A cannot list or delete User B's conversations, even if A knows B's conversation UUID.
- Chat text is not persisted until that token owner explicitly grants chat-storage consent.
- No service-role key, Agnes key, or token-admin secret appears in browser assets.
