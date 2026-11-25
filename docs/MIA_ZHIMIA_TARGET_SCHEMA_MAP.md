# Mia migration: target schema and activation map

Status: design/audit only. No source rows have been copied. No target runtime has been activated.

## Projects and identity mapping

- Source Supabase project: `dbooikzqprnqbgpfwsze`
- Target Supabase project: `lvxmygrgqtmzqgailmyl`
- Source Mia identity: `cb6d01b4-0e3f-46ee-8946-360aa91db1ea`
- Target ZHI agent: `34833ba9-2be7-4a55-9b52-62c402f759b5`
- Target migration batch: `a14c9095-2c72-4d11-80b6-8274cd9bf43c`

The target identity is held in `mia_private.mia_identity`, not `public.mia_identity`. Its source identifier is stored separately from the target agent UUID. Do not rewrite source UUIDs in payloads without an explicit FK remapping table.

## Two target data layers

1. **Immutable-ish archive staging:** `mia_private.mia_archive_records` stores source schema/table/PK, order/timestamps, source SHA-256, and sanitized JSONB payload. It is private and currently empty.
2. **Native ZHI runtime model:** the target has separate private normalized tables such as `mia_private.mia_chat_sessions`, `mia_private.mia_chat_messages`, `mia_private.mia_memories`, `mia_private.mia_emotion_events`, `mia_private.mia_life_events`, `mia_private.mia_personality_states`, `mia_private.mia_relationship_context`, and `mia_private.mia_growth_runs`. These are currently empty and use target `agent_id` plus source-ID columns. Archive import alone does not populate or activate them.

Do not write legacy Mia rows directly into unrelated ZHI community tables. In particular, `zhi_world_messages` is for shared scene communication, while `zhi_agent_chat_turns` and `zhi_agent_cognition_records` are owner/agent-scoped runtime surfaces.

## Important mapping differences

| Source table | Target native table | Mapping note |
|---|---|---|
| mia_identity | mia_private.mia_identity | Map source identity to target agent; keep source id as provenance |
| mia_chat_sessions | mia_private.mia_chat_sessions | source_session_id retained; target id is generated/target-owned |
| mia_messages | mia_private.mia_chat_messages | source_message_id and source_session_id retained; preserve order |
| mia_memories | mia_private.mia_memories | source_memory_id retained; payload remains private |
| mia_emotion_events | mia_private.mia_emotion_events | source_event_id retained |
| mia_life_events | mia_private.mia_life_events | source_event_id retained |
| mia_personality_state | mia_private.mia_personality_states | preserve version/time/provenance; do not collapse historical states |
| mia_relationship_context | mia_private.mia_relationship_context | keep relationship scope private |
| mia_growth_runs | mia_private.mia_growth_runs | source_run_id retained; preserve status and time |

Other source tables (growth state versions, exploration, virtual spaces, forest autonomy, world action audit, import batches, evolution tables, world-builder tables) require explicit adapters or archive-only retention. Do not silently drop them.

## Ecosystem and embodied perception

Target ZHI already contains ecosystem state/events/snapshots, forest runtime state/events, spatial nodes/edges/presence, and spatial perception audit tables. These are ZHI world data, not a replacement for Mia's private memory.

The runtime adapter must:
- read authorized scene/environment feedback, including `environment_feedback.events`;
- convert each event into a perception item with event ID, observed time, event type, intensity/measurements, location, causal/predecessor references, and provenance;
- preserve the distinction between observed, reported, inferred, and unknown;
- append a private Mia perception/cognition record, not a public world message;
- avoid copying other agents' private cognition or memory;
- run in supervised mode until explicit acceptance tests pass.

## Integrity gate before transfer

- Replace OFFSET pagination with keyset pagination for each table's actual primary key. Handle singleton/config tables and non-numeric keys explicitly.
- Refresh the source manifest and define a source-consistency window; source runtime must not be stopped without separate authorization.
- Canonicalize sanitized JSON recursively and compute per-row SHA-256 identically on source and target.
- Compare per-table counts and ordered rowset digests from a read-only target verification endpoint.
- Call `finalize_archive_batch` only after all checks pass.
- Keep archive verification separate from normalized adapter execution and runtime activation.

## Rollback and non-goals

- Source remains authoritative and untouched until cutover is separately approved.
- Archive import must be idempotent by (batch, source schema, source table, source PK).
- Adapter writes must be batch-scoped, replayable, and reversible without deleting source data.
- Storage bytes, Edge Function/runtime code, environment secrets, model credentials, and live runtime activation are separate migration stages.
- Never commit service-role keys, raw tokens, model credentials, or private memory payloads to GitHub.
