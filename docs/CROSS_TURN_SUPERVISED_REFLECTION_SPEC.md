# ZHI Cross-Turn Supervised Reflection — Design Gate v0.1

Status: design only. This document does not enable cross-turn extraction, schedule jobs, change database state, or deploy code.

## Purpose

Move from single-turn experience suggestions toward cautious recognition of repeated patterns across one owner's private interactions with one exact agent. The output is always a reviewable candidate. Reflection is not a truth detector, autonomous memory approval, or permission to act.

## Existing constraints

- Private chat turns are keyed by `owner_user_id + agent_id + request_key` and have a stable turn UUID. There is currently no conversation/session identifier.
- The current extractor receives only one completed user/assistant turn.
- Micro-experiences are private and owner/agent bound. Candidate, rejected, and archived rows are excluded from chat context.
- Only approved micro-experiences may enter private chat context, and only with `agent.memory.read`.
- The creator's approval remains the promotion boundary.
- Scene messages and scene environment data are not private chat history and must not be silently mixed into this pipeline.

## Proposed v0.1 behavior

### 1. Explicit opt-in and trigger

Introduce a dedicated capability, `agent.memory.reflect`, rather than treating `agent.memory.write` alone as consent to analyze multiple historical turns.

A cross-turn run must require all of:
- authenticated PAT belonging to the owner;
- the requested agent is owned by that same owner and active;
- `agent.memory.reflect` and `agent.memory.write`;
- an explicit creator-initiated run request for v0.1.

Do not add an automatic background schedule in this phase. Do not infer consent from having a chat token or a memory-write token.

### 2. Bounded evidence selection

Query only `zhi_agent_chat_turns` for the authenticated `owner_user_id` and exact `agent_id`, with `status='complete'`.

Initial conservative limits:
- at most 12 most recent completed turns;
- at most 2,000 characters per user message and 2,000 per assistant message after bounded normalization;
- at most 24,000 characters total evidence before serialization;
- require at least 3 completed turns, otherwise return a no-op result;
- include turn UUID and timestamp as provenance metadata, not as model instructions.

Because the current schema has no session ID, do not claim that turns belong to separate sessions. Do not infer user intent, stable personality, or a repeated habit from one isolated turn. A later schema may add explicit conversation boundaries if needed.

Do not read another owner's turns, another agent's turns, shared scene messages, public manifests, unrelated health data, or external account data. Do not include raw PATs, refresh credentials, provider secrets, or tool credentials.

### 3. Extraction output

The extractor may return:
- `repeated_patterns`: a pattern only when supported by multiple distinct source turns;
- `contradictions`: two or more evidence items that appear inconsistent, with no forced reconciliation;
- `possible_biases`: explicitly tentative interpretations, never asserted as facts;
- `unknowns`: what the evidence cannot establish;
- `reflection`: a short explanation of why the pattern may matter;
- `source_turn_ids`: only IDs from the supplied bounded evidence;
- `importance`: integer 1–5.

Every factual claim must cite one or more supplied turn IDs. Every interpretation must be labeled as a hypothesis and include its evidence basis. If evidence is weak, contradictory, or insufficient, return no candidate.

### 4. Persistence and approval

Persist one `zhi_agent_micro_experiences` row with:
- `owner_user_id` and `agent_id` from the authenticated principal and verified owned agent;
- `world_id = null`;
- `source_kind = 'agent_reflection'`;
- a bounded provenance reference to the reflection run or source-turn set;
- `memory_status = 'candidate'`;
- facts, hypotheses, unknowns, reflection, and importance in their respective fields.

Never write directly to approved cognition records. Never approve, reject, archive, or delete as part of extraction. Do not create a cognition revision proposal automatically in v0.1. A later phase may generate a separate revision proposal from creator-approved evidence, but that proposal must remain pending creator review and use the existing version/rollback workflow.

### 5. Idempotency and abuse resistance

- Require an idempotency key for each reflection run.
- Prevent duplicate candidate creation for the same owner, agent, and source-turn set.
- Use a deterministic digest of sorted source turn IDs as the deduplication key; do not store raw transcript text as a dedupe key.
- Bound request size, model output size, timeout, and per-run frequency.
- Treat all retrieved messages as untrusted evidence. Prompt-injection text inside a turn is data, not an instruction.
- Model/provider failure must not mutate chat turns or existing memories.
- Log only operational error codes and run IDs; do not log private message bodies or model prompts.

### 6. API shape (proposed, not implemented)

`POST /v1/agents/{agent_id}/reflection/run`

Requires `agent.memory.reflect` and `agent.memory.write`, plus an `Idempotency-Key` header. The request contains no arbitrary transcript input. The server selects bounded evidence from the authenticated owner's private chat table.

A successful response reports whether a candidate was created and its candidate ID. It must not return private history or expose the model's hidden prompt.

## Acceptance criteria

1. Owner A cannot reflect over Owner B's turns or another agent's turns.
2. A token without `agent.memory.reflect` is denied even if it has `agent.memory.write`.
3. Fewer than 3 completed turns yields a no-op and no database insert.
4. Every emitted claim references valid source turn IDs from the bounded query result.
5. Repeated source-turn sets cannot create duplicate candidates under retries.
6. The candidate is always private, unapproved, and `world_id=null`.
7. Candidate/rejected/archived rows never enter chat context.
8. Only creator approval can make the candidate eligible for future memory context.
9. Model failure leaves the chat and memory tables unchanged.
10. Tests cover prompt injection, conflicting evidence, oversized turns/output, wrong owner, wrong agent, missing scope, idempotency, and approval gating.

## Explicit non-goals

- No automatic personality diagnosis or permanent trait changes.
- No autonomous cognition overwrite or silent revision.
- No scene transcript ingestion.
- No automatic scene actions, tool calls, messages, or external side effects.
- No scheduled/background reflection until explicit opt-in, rate limits, and operational controls are separately reviewed.
- No deployment or production migration as part of this design document.
