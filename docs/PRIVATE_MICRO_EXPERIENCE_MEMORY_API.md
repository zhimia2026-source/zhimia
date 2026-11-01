# ZHI Private Micro-Experience Memory API v1

This module stores private, owner-scoped experiences for one ZHI agent. It is intentionally separate from scene messages and public agent manifests.

## Security model

- Authenticate every request with a ZHI personal access token (PAT) in `Authorization: Bearer <token>`.
- The function hashes the presented token with SHA-256 and looks up only the hash in `zhi_personal_access_tokens`.
- Revoked and expired tokens are rejected; successful authentication conditionally updates `last_used_at`.
- Every route checks an explicit capability and verifies that the requested agent belongs to the authenticated owner.
- The memory table has RLS enabled and grants no table privileges to `anon` or `authenticated`; only server-side `service_role` can access it.
- Scene-linked memory creation additionally requires an active membership for the same owner and agent.
- Candidate memories are never automatically approved.
- Hard deletion removes the row; no tombstone or content-bearing audit copy is retained.

## Token capabilities

- `agent.memory.read`
- `agent.memory.write`
- `agent.memory.approve`
- `agent.memory.delete`

The token-admin allowlist and database constraints include these scopes. A token must be issued with the required scopes; existing tokens are not silently expanded. The existing maximum of 12 capabilities per token remains.

## Routes

Base URL: `https://lvxmygrgqtmzqgailmyl.supabase.co/functions/v1/zhi-memory`

### List experiences

`GET /v1/agents/{agent_id}/micro-experiences?status=approved&limit=50`

Requires `agent.memory.read`. Status may be `candidate`, `approved`, `rejected`, `archived`, or `all`. If omitted, only approved records are returned.

### Create a candidate

`POST /v1/agents/{agent_id}/micro-experiences`

Requires `agent.memory.write`.

```json
{
  "experience_type": "observation",
  "source_kind": "direct_observation",
  "world_id": null,
  "observed_facts": [{"claim": "Window light moved across the reading desk."}],
  "hypotheses": [{"claim": "The sun angle may have changed.", "basis": "A prior observation"}],
  "unknowns": ["Whether airflow changed the dust movement"],
  "reflection": "I will observe again before treating the explanation as fact.",
  "importance": 2
}
```

Supported experience types: `observation`, `touch`, `interaction`, `rest`, `environment_change`, `reflection`.

Supported source kinds: `direct_observation`, `scene_event`, `agent_reflection`, `creator_input`.

Each fact and hypothesis must be an object with a non-empty `claim`. The API caps each list at 50 items, unknowns at 30 items, and reflection at 4,000 characters. The server always creates the record as `candidate`; clients cannot set the approval state.

When `world_id` is supplied, the authenticated owner must have an active membership for that exact agent in that scene.

### Review

`POST /v1/micro-experiences/{experience_id}/review`

Requires `agent.memory.approve`.

Body: `{"status":"approved"}`, `{"status":"rejected"}`, or `{"status":"archived"}`.

Allowed transitions are candidate → approved/rejected and approved → archived. Updates use compare-and-set semantics to prevent concurrent review races.

### Hard delete

`DELETE /v1/micro-experiences?id={experience_id}`

Requires `agent.memory.delete`. The row is physically deleted and cannot be restored through this API.

## Private chat integration

The existing private agent chat handler loads at most 12 most-recent approved micro-experiences only when the request token also has `agent.memory.read`. The query is scoped to the authenticated owner and exact agent ID. Candidate, rejected, and archived experiences are excluded. Scene messages and scene environment context remain separate and are never written into private memory. The prompt adapter bounds and serializes facts, hypotheses, unknowns, reflection, and importance as untrusted data; it does not include private source references or scene identifiers.

## Supervised reflection generation

When a private chat request is made with a PAT that includes `agent.memory.write`, the community chat handler may run a bounded second model pass over only the just-completed user/assistant turn. The extractor returns either no proposal or a structured candidate containing observed facts, hypotheses, unknowns, reflection, and importance.

- The extractor input is a bounded JSON evidence payload and is explicitly treated as untrusted data.
- The extractor cannot approve memories, call tools, or modify the system prompt.
- The server validates the response shape and limits before inserting it as `memory_status=candidate` with `source_kind=agent_reflection`.
- The source reference points to the private chat turn; it is not injected into the model's future memory context.
- No scene membership is inferred from a chat's optional scene selection; generated memories remain private with `world_id=null`.
- Extraction and insert failures are best-effort and do not undo a completed chat turn.
- The creator must still review the candidate. Only approved memories can enter later private chat context, and only with `agent.memory.read`.

The extractor receives the current turn only, not the entire conversation history. This reduces data exposure and keeps provenance clear. It is a candidate-generation aid, not an objective truth detector.

## Important boundaries

- Do not place full chat transcripts, credentials, refresh tokens, or unrelated personal data in experience payloads.
- A scene identifier is context only; scene membership never grants access to private memories.
- A successful insert means only that a candidate was stored, not that its facts or hypotheses are true.
- Memory approval is a creator review action, not an objective truth guarantee.


## Disposable-project E2E test

The repository includes `scripts/smoke_test_micro_experience_memory_e2e.mjs`. It refuses the production Supabase URL and requires `ZHI_E2E_DISPOSABLE_PROJECT=1`.

Provide these local environment variables:
- `ZHI_MEMORY_API`: disposable project's `zhi-memory` function URL.
- `ZHI_COMMUNITY_API`: same disposable project's `zhi-community` function URL.
- `ZHI_MEMORY_OWNER_TOKEN`: account A token with all four memory scopes.
- `ZHI_MEMORY_OTHER_TOKEN`: account B token with `agent.memory.read` and `agent.memory.delete`, but no ownership of account A's agent.
- `ZHI_MEMORY_LIMITED_TOKEN`: account C token without any of the four `agent.memory.*` scopes.

Run with Node.js: `node scripts/smoke_test_micro_experience_memory_e2e.mjs`.

The test creates temporary agents in the disposable project. It does not print tokens or memory contents. Do not point it at production.
