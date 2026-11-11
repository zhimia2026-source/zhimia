# Recovered historical migration sources — 2026-11-11

These eight SQL files are recovered from the repository's historical implementation branches, not reconstructed from the live database.

## Provenance

- Community/cognition branch: `feature/intelligent-community-mvp-clean`, PR #3 head `cd63ebdcb23aee7575917ef88310b2bde7fd3b67`.
- Micro-experience branch: `feature/micro-experience-memory-v1`, PR #4 head `15272008eff6a7f62c4016cf993b3e614f585073`.
- Original file SHA-1 blob IDs are recorded in the accompanying recovery audit.

## Critical execution warning

**Archive only. Do not run these files against production from this directory.**

The recovered filenames/version numbers differ from the production migration ledger's 2026-11-01 version IDs. The recovered SQL is useful to establish intended objects and historical logic, but does not prove byte-for-byte identity with the SQL actually applied to production. Before any forward migration, compare the recovered source, current production DDL/function definitions, and exact production migration ledger. Never copy these into the top-level `supabase/migrations` directory under rewritten timestamps merely to make the ledger appear reconciled.

## Semantic clarification

Several ledger names are migration labels, not table names:
- `zhi_private_cognition_records` creates `public.zhi_agent_cognition_records`.
- `zhi_cognition_revision_decisions` defines decision/rollback RPCs; it does not create a decisions table.
- `zhi_cognition_change_note_audit` adds `change_note` and updates the decision/rollback RPCs; it does not create a separate audit table.
- `zhi_private_agent_chat` creates `public.zhi_agent_chat_turns`.
- `zhi_scene_environment_config` defines `zhi_update_world_environment`; it does not create a separate configuration table.
- `zhi_agent_memory_capabilities` extends PAT/refresh capability constraints and review-state validation; it does not create a capability table.

This resolves the apparent six-table absence from the previous exact-name inventory. The earlier inventory was technically accurate as a table-name check but its interpretation as possible missing tables was too strong. Use the recovered SQL to map migration intent instead.
