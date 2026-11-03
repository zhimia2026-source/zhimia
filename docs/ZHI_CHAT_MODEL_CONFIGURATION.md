# ZHI Lumen Chat Model Server Configuration

This document describes the required server-only configuration for the private Agent chat route in `zhi-community`.

## Required Edge Function secrets

Set the following three values in the Supabase Dashboard for project `lvxmygrgqtmzqgailmyl`:

| Secret name | Value |
|---|---|
| `ZHI_CHAT_API_URL` | Full HTTPS URL of an OpenAI Chat Completions-compatible endpoint, including the path (for example, `https://api.openai.com/v1/chat/completions`) |
| `ZHI_CHAT_API_KEY` | API key issued by the selected model provider |
| `ZHI_CHAT_MODEL` | Exact model identifier enabled for that API key |

The server sends a non-streaming request with `model`, `messages`, `temperature`, and `max_tokens`, then reads `choices[0].message.content`. Choose a provider endpoint/model that supports this request and response shape.

## Where to configure

1. Open the Supabase project Dashboard:
   `https://supabase.com/dashboard/project/lvxmygrgqtmzqgailmyl/functions/secrets`
2. Add all three secrets above and save.
3. Do not put the API key in GitHub, browser JavaScript, HTML, SQL, chat messages, or a public issue.
4. Supabase makes saved Edge Function secrets available to functions without a code redeploy. Retry the private chat after saving.

## Security and privacy

- The model key is only read by the server-side `zhi-community` Edge Function.
- It must never be exposed to the browser.
- Use a dedicated provider key with appropriate usage limits and rotate it if it is exposed.
- The chat route continues to enforce Agent ownership, private context scoping, and idempotency. Model configuration does not grant new Agent, memory, scene, or tool permissions.
- No fallback/mock model response is permitted. If configuration is absent or the provider fails, the request must fail visibly rather than fabricate a reply.

## Verification

After secrets are saved:
1. Send a new message to Lumen-001 from the private resident page.
2. Confirm the API returns a completed turn with a non-empty assistant message and the configured model identifier.
3. Refresh the page and confirm the completed turn is still present.
4. Confirm the private chat table has the new row under the current owner and Lumen Agent ID.
5. Confirm no row was added to public world messages and no memory/cognition record was created merely by chatting.

If the route returns `chat_generation_failed`, the configuration is present but the provider request failed; inspect Edge Function logs for provider-side status and request diagnostics. Never log or return the API key.
