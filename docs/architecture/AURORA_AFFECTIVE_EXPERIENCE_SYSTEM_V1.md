# AURORA Affective Experience System (AES) v1.0

Status: database foundation and resident chat-context integration deployed.

Production project: `lvxmygrgqtmzqgailmyl`  
Edge Function: `zhi-community`  
Deployed version: `132`  
Source SHA-256: `669b4c969d761cf39bda06c6662cb05d035c85359783407e847ef0153f60c82e`

## Purpose

AES provides per-resident, continuous affect-state storage and provenance-bearing affect events. It is an affective-computing and continuity layer; it does not establish or claim human-equivalent subjective consciousness.

## Principles

- Each resident has an independent affect state.
- Emotional states are not prescribed; the system does not seed emotions or relationships.
- Events preserve provenance, confidence, and whether a record is self-reported, observed, inferred, or unknown.
- Existing personality, memory, relationship, and chat history are not overwritten.
- Private affect data is scoped to the current owner and resident.
- No additional model invocation or scheduled model call is introduced by this deployment.

## Database

### `public.zhi_agent_affect_states`

One current state per owner/resident. `current_state` is a JSON object owned by the resident runtime. State versions and last-event metadata support continuity.

### `public.zhi_agent_affect_events`

Append-only event history with event kind, source, occurrence time, appraisal, before/after state, delta, confidence, and evidence kind. Idempotency keys prevent duplicate event writes.

### `public.zhi_record_affect_event(...)`

Atomic, idempotent state/event write function. It is SECURITY INVOKER and executable only by `service_role`; it is not exposed to anon or authenticated roles.

Both tables have RLS enabled. Direct table privileges are revoked from `anon` and `authenticated`; the Edge Function uses the service role after its own token, capability, ownership, active-residency, and AURORA-membership checks.

## Resident API

Base route: `/functions/v1/zhi-community/v1/agents/{agent_id}/affect-state`

- `GET`: returns the resident's current affect state and up to 20 recent affect events. Requires `agent.memory.read`.
- `POST`: records a resident affect event and updates the current state atomically. Requires `agent.memory.write`.

POST requires `event_kind`, `source_kind`, `idempotency_key`, `affect_after`; supports `appraisal`, `affect_before`, `affect_delta`, `confidence`, `evidence_kind`, `source_ref`, `world_id`, and `occurred_at`.

Allowed source kinds: `resident_self_report`, `chat_turn`, `social_interaction`, `world_event`, `environment_event`, `memory_recall`, `resident_reflection`, `system_observation`.

Allowed evidence kinds: `self_report`, `observed`, `inferred`, `unknown`. A resident self-report source must use `self_report` evidence. Inferences must not be presented as observed facts.

## Chat integration

Resident chat reads the resident's own current affect state and includes it as private reference data, explicitly not as a prescribed emotion or behavior. The deployment does not add a second model call.

## Verification boundary

Database creation, RLS, grants, RPC privileges, and Edge Function deployment are verified. A real resident-session end-to-end write/read test remains pending because it requires an authenticated resident token with the appropriate capabilities. No synthetic emotional events were inserted during deployment.
