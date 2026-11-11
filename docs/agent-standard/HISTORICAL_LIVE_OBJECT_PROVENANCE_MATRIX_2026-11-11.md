# Historical Migration → Live Production Object Provenance Matrix — 2026-11-11

## Correction to the earlier table-name interpretation

The migration labels are not all table names. The previous exact-name inventory correctly observed that only two labels matched live table names, but it incorrectly treated the other six as potentially absent tables. Recovered source SQL shows that six labels describe migrations which create differently named objects, add columns, or define RPCs. **Do not create tables named after those migration labels.**

## Provenance matrix

| Production migration label | Recovered SQL source | What the SQL actually does | Current production object/status | Remaining uncertainty |
|---|---|---|---|---|
| `zhi_agent_micro_experiences` | `20261101090000_zhi_agent_micro_experiences.sql` | Creates `zhi_agent_micro_experiences` table, owner/agent FK, RLS, service-role-only access | Table exists, RLS enabled; later `auto_curated` state, extra indexes and stricter review check are present | Exact byte identity with production-applied SQL is unverified |
| `zhi_agent_memory_capabilities` | `20261101093000_zhi_agent_memory_capabilities.sql` | Alters PAT/refresh capability allowlists and micro-experience review-state constraint; creates no table | PAT/refresh constraints exist and include later capability additions | Exact deployment body and later capability migration sequence need source provenance |
| `zhi_private_cognition_records` | `20261030120000_zhi_private_cognition_records.sql` | Creates `zhi_agent_cognition_records` | Table exists, RLS enabled, owner/agent composite FK and cognition checks/indexes exist | Later additions are present; exact production body identity unverified |
| `zhi_cognition_revision_proposals` | `20261030150000_zhi_cognition_revision_proposals.sql` | Creates `zhi_cognition_revision_proposals`, `zhi_cognition_revision_proposal_feedback`, and proposal creation RPC | Both tables and RPC exist; proposal schema has later consent-binding fields and integrity trigger | Need provenance for later agent-consent hardening |
| `zhi_cognition_revision_decisions` | `20261030170000_zhi_cognition_revision_decisions.sql` | Defines decision and rollback RPCs; creates no decision table | Decision RPC exists; rollback RPC currently fails closed until agent-consented revision proposal | Need preserve current fail-closed replacement |
| `zhi_cognition_change_note_audit` | `20261030190000_zhi_cognition_change_note_audit.sql` | Adds `change_note` to cognition records and replaces decision/rollback RPCs; creates no audit table | `change_note` exists; append-only UPDATE/DELETE trigger exists | Verify trigger function body and introducing hardening migration |
| `zhi_private_agent_chat` | `20261030200000_zhi_private_agent_chat.sql` | Creates `zhi_agent_chat_turns` | Table exists, RLS enabled, owner/agent FK and request-key unique index exist | Exact production body identity unverified |
| `zhi_scene_environment_config` | `20261030210000_zhi_scene_environment_config.sql` | Defines `zhi_update_world_environment` RPC using `zhi_worlds.environment_state`; creates no config table | RPC and environment_state column exist | Verify current RPC grants and later caller evolution |

## Recovered source provenance

- PR #3 branch `feature/intelligent-community-mvp-clean`, head `cd63ebdcb23aee7575917ef88310b2bde7fd3b67`, provides six cognition/chat/environment SQL files.
- PR #4 branch `feature/micro-experience-memory-v1`, head `15272008eff6a7f62c4016cf993b3e614f585073`, provides the micro-experience and memory-capability SQL files.
- All eight recovered files are archived in `docs/archive/production-migration-sources/` with their original source filenames. The archive README explicitly says not to replay them.

## Current production hardening that must be retained

- Private tables: RLS enabled, no RLS policies observed, grants only to `postgres` and `service_role` in the inspected grant view; no `anon` / `authenticated` table grants observed.
- Cognition records: append-only UPDATE/DELETE guard trigger.
- Revision proposals: integrity guard trigger and agent-consent fields/checks.
- Micro-experiences: `auto_curated` state and stricter reviewed-state constraint beyond the initial source.
- PAT/refresh capabilities: allowlists include later scopes not present in the early memory-capability source.
- Rollback: current RPC explicitly rejects the old rollback path pending agent-consented revision proposal.

## Reconciliation decision

The source-recovery blocker is **partially resolved**: repository historical SQL has been recovered and archived. The exact production-applied SQL bodies and all later hardening migrations are not yet fully mapped. Do not replay archived SQL, alter the production migration ledger, or overwrite live definitions. Next compare complete current schema/function definitions against the recovered baseline and locate the later consent/runtime hardening source commits. Only prepare a forward-only migration if a real gap is demonstrated.


## Later hardening layer: source files not yet recovered

Production migration ledger also contains:
- `20261103043132_zhi_constitutional_protection_v01`
- `20261103043343_zhi_constitutional_protection_hardening`
- `20261103043549_zhi_agent_consent_attestation_gate`
- `20261103044554_zhi_revision_consent_trust_boundary`

The exact SQL files were not found on the checked refs (`main`, this personality branch, `feat/zhi-super-brain-v1-foundation`, and `feat/mia02-seven-brain-v1`). Current production behavior is nevertheless directly observable:
- `zhi_agent_cognition_consents` stores owner/agent/proposal-bound consent proofs, runtime attestation, attestation verification, nonce hash, scopes, content hash, base version, expiry and revocation.
- `zhi_guard_cognition_consent` makes consent proof fields immutable and revocation one-way; deletion is rejected.
- `zhi_guard_revision_proposal_integrity` makes proposal payload immutable and verifies exact consent binding before approval.
- `zhi_guard_append_only_record` blocks cognition record updates/deletes.
- `zhi_rollback_cognition_version` is intentionally fail-closed until an agent-consented revision proposal is used.

These later protections are production-critical. Recover their exact source or establish a reviewed live-schema/function baseline before changing cognition or consent logic.
