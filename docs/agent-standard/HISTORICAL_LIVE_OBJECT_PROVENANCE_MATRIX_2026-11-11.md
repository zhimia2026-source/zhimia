# Historical-to-Live Object Provenance Matrix — 2026-11-11

This is a hypothesis register based on read-only production introspection. It is deliberately not a migration specification. “Candidate” means semantic resemblance only; it does not prove that the historical object was renamed, replaced, or intentionally retired.

| Historical migration object | Candidate current object(s) | Evidence observed in production | Confidence | Still required |
|---|---|---|---|---|
| `zhi_agent_micro_experiences` | Same exact table | Exact table exists, RLS enabled, 41 rows; owner/agent scope and source/importance/status constraints observed | Confirmed live object | Recover original SQL to verify complete historical definition |
| `zhi_agent_memory_capabilities` | Possibly capability fields on `zhi_personal_access_tokens`, `zhi_refresh_credentials`, and `zhi_world_memberships` | Capability arrays exist in these other domains; no function or table named `zhi_agent_memory_capabilities` found in current public inventory | Unproven | Inspect historical callers and deployed Edge Function code; determine whether this was an actual table or an early capability concept |
| `zhi_private_cognition_records` | `zhi_agent_cognition_records` | Live table comment identifies private cognition records; RLS enabled; cognition proposal creation/decision functions read and append records; append-only trigger observed | Strong semantic candidate; provenance unproven | Find migration/commit that introduced `zhi_agent_cognition_records`; compare all constraints, indexes, grants and policies |
| `zhi_cognition_revision_proposals` | Same exact table | Exact table exists, RLS enabled; proposal creation and decision functions use it; consent/hash/version constraints observed | Confirmed live object | Recover original SQL and later hardening migrations |
| `zhi_cognition_revision_decisions` | Decision fields on `zhi_cognition_revision_proposals` and `zhi_decide_cognition_revision_proposal` | Proposal table stores `status`, `decided_at`, `reviewer_user_id`, `decision_note`; decision RPC updates proposal state and inserts a new cognition version; no exact decision table exists | Possible consolidation; unproven | Inspect later migration provenance and audit requirements; verify whether a separate append-only decision ledger was intentionally retired |
| `zhi_cognition_change_note_audit` | `change_note` on `zhi_agent_cognition_records` plus append-only record guard | Live cognition records include `change_note`, `change_kind`, `previous_record_id`, `source_proposal_id`; update/delete guard trigger exists; no exact audit table found | Weak candidate only | Determine whether a distinct audit log is required; a note column is not equivalent to an audit ledger |
| `zhi_private_agent_chat` | `zhi_agent_chat_turns` | Live table comment explicitly describes private owner-to-agent turns scoped by owner and agent; `mia_brain_complete_chat_turn` reads/updates it | Strong semantic candidate; provenance unproven | Compare chat-turn schema, uniqueness/idempotency, RLS/grants, and runtime call sites |
| `zhi_scene_environment_config` | Possibly `zhi_spatial_nodes`, `zhi_ecosystem_states`, `zhi_ecosystem_events`, `zhi_forest_runtime_state` | Current spatial ontology, world ecological state/event stream, and per-agent forest runtime state exist; no exact config table found | Unproven | Inspect scene/runtime code and migration provenance; establish whether config was merged into metadata or replaced by event/state models |

## Important distinctions

- A cognition record's `change_note` is not automatically equivalent to a separate immutable audit ledger.
- A proposal row's decision fields are not automatically equivalent to a separate append-only decision history.
- Generic token or membership capability arrays are not automatically equivalent to agent memory-specific capability grants.
- Spatial nodes and ecosystem events are not automatically equivalent to a scene configuration registry.
- The exact private-chat table name is absent, but the current `zhi_agent_chat_turns` object has an explicit private owner/agent isolation comment and a live completion RPC reference.

## Reconciliation gate

Do not recreate absent historical tables or write compatibility views based on this matrix alone. The next engineering step is to obtain the original migrations or the later migrations that introduced the candidate live objects, then produce a diffed, forward-only reconciliation proposal. If those sources cannot be recovered, the proposal must explicitly document unknown provenance and be tested on a disposable database before production authorization is requested.
