# Production Migration Source Recovery & Schema Reconciliation — 2026-11-11

## Executive correction

The earlier exact-name table inventory was interpreted too strongly. Six of the eight migration labels are **not intended to be table names**. Historical source SQL has now been recovered from the repository's implementation branches. The absence of tables named `zhi_agent_memory_capabilities`, `zhi_private_cognition_records`, `zhi_cognition_revision_decisions`, `zhi_cognition_change_note_audit`, `zhi_private_agent_chat`, and `zhi_scene_environment_config` is expected from the recovered SQL semantics; it is not evidence that six production tables are missing.

## Source recovery

Recovered eight SQL source files and archived them under `docs/archive/production-migration-sources/` so they cannot be accidentally replayed by the normal top-level Supabase migration runner.

Source branches:
- PR #3, branch `feature/intelligent-community-mvp-clean`, head `cd63ebdcb23aee7575917ef88310b2bde7fd3b67`.
- PR #4, branch `feature/micro-experience-memory-v1`, head `15272008eff6a7f62c4016cf993b3e614f585073`.

Original Git blob SHA-1 values:
- `20261030120000_zhi_private_cognition_records.sql`: `1fe41975243e12765eb33a91f3edbc0dfb59c125`
- `20261030150000_zhi_cognition_revision_proposals.sql`: `16fc440f59210f974743861060946e19f17623fa`
- `20261030170000_zhi_cognition_revision_decisions.sql`: `ef7c19611710845dbf5d1ae811df46c9a851e8a2`
- `20261030190000_zhi_cognition_change_note_audit.sql`: `a8029a8e63c66780015a8c76815c789cf637a206`
- `20261030200000_zhi_private_agent_chat.sql`: `47e686abb8840305e943d599d8d0d591fca3939a`
- `20261030210000_zhi_scene_environment_config.sql`: `da42a61a177eae779f3b0b6ad3f75a7b04da973d`
- `20261101090000_zhi_agent_micro_experiences.sql`: `612f7817915dfa80fdbbf73106a61e47c6fabc2d`
- `20261101093000_zhi_agent_memory_capabilities.sql`: `b388dcf25a3c1f43ed055a6e6ee80e108f8a1294`

These are verified repository source blobs. The filenames/timestamps differ from the eight production migration-ledger version IDs, so this recovery does not claim that the production-applied SQL bytes are identical to these archived files. It does restore the intended implementation source and enables semantic reconciliation.

## Historical migration intent → current production object

| Production ledger label | Recovered source file | Intended effect | Current production evidence |
|---|---|---|---|
| `zhi_agent_micro_experiences` | `20261101090000_zhi_agent_micro_experiences.sql` | Creates private per-agent micro-experience table | `public.zhi_agent_micro_experiences` exists; RLS on; current schema has later `auto_curated` state and extra indexes/constraints |
| `zhi_agent_memory_capabilities` | `20261101093000_zhi_agent_memory_capabilities.sql` | Extends PAT/refresh credential capability allowlists and memory review-state constraint; no capability table | PAT and refresh credential capability constraints exist; production allowlist includes later capabilities beyond this recovered source |
| `zhi_private_cognition_records` | `20261030120000_zhi_private_cognition_records.sql` | Creates `public.zhi_agent_cognition_records` | Table exists; RLS on; later change metadata columns and append-only guard are present |
| `zhi_cognition_revision_proposals` | `20261030150000_zhi_cognition_revision_proposals.sql` | Creates proposal + feedback tables and proposal-creation RPC | Both tables and RPC exist; later agent-consent columns/checks and proposal-integrity trigger are present |
| `zhi_cognition_revision_decisions` | `20261030170000_zhi_cognition_revision_decisions.sql` | Defines owner decision and rollback RPCs; no decisions table | Decision RPC exists; current rollback RPC intentionally rejects legacy rollback with `zhi_rollback_requires_agent_consented_revision_proposal` |
| `zhi_cognition_change_note_audit` | `20261030190000_zhi_cognition_change_note_audit.sql` | Adds `change_note` and updates decision/rollback RPCs; no audit table | `change_note` column exists; cognition rows have append-only UPDATE/DELETE guard |
| `zhi_private_agent_chat` | `20261030200000_zhi_private_agent_chat.sql` | Creates `public.zhi_agent_chat_turns` | Table exists; RLS on; owner/agent composite FK and request-key uniqueness exist |
| `zhi_scene_environment_config` | `20261030210000_zhi_scene_environment_config.sql` | Defines `zhi_update_world_environment` RPC; no config table | RPC exists; `zhi_worlds.environment_state` exists |

## Current security and evolution observations

Read-only production introspection confirms:
- RLS is enabled on cognition records, revision proposals, proposal-feedback, private chat turns, and micro-experiences.
- No RLS policies were returned for those private tables.
- Table grants observed for these private tables are to `postgres` and `service_role`; no `anon` or `authenticated` grants were returned.
- `zhi_agent_cognition_records` has an append-only guard trigger for UPDATE/DELETE.
- `zhi_cognition_revision_proposals` has an integrity guard trigger for INSERT/UPDATE/DELETE.
- Production cognition proposal schema contains later agent-consent binding fields/checks not present in the recovered early source.
- Production memory status includes `auto_curated`, beyond the initial candidate/approved/rejected/archived states.
- Production PAT/refresh capability constraints include later additions such as `community.agent.create` and `spatial:movement.execute`.
- Current rollback RPC is fail-closed pending an agent-consented revision proposal.

These differences indicate later hardening/evolution. They must be preserved; do not replace current production functions or constraints with the older recovered definitions.

## Migration version reconciliation

The production migration ledger records:
- `20261101022715` zhi_agent_micro_experiences
- `20261101022811` zhi_agent_memory_capabilities
- `20261101023225` zhi_private_cognition_records
- `20261101023229` zhi_cognition_revision_proposals
- `20261101023236` zhi_cognition_revision_decisions
- `20261101023238` zhi_cognition_change_note_audit
- `20261101023241` zhi_private_agent_chat
- `20261101023242` zhi_scene_environment_config

Recovered branch filenames have different timestamps. The mapping above is supported by migration names, SQL semantics, current live objects, and PR #3/#4 production deployment notes, but exact production SQL-body identity is not established. Do not alter migration history to make the timestamps match.

## Next safe step

1. Keep recovered SQL in the archive directory only.
2. Capture a complete current production schema/function baseline.
3. Compare the baseline against recovered source plus later production hardening, identifying which differences are intentional and which are unexplained.
4. Create a separate, forward-only baseline/reconciliation proposal only if a real schema gap is proven.
5. Run that proposal against a disposable Supabase project/branch and validate owner isolation, append-only cognition, agent consent, memory review state, and private-chat separation.
6. Only after review and explicit production authorization, apply any new additive migration.

## Personality parameter rollout

PR #54 remains Draft. The personality runtime helper, prompt integration, tests, and idempotent seed are staged on the feature branch. Production `zhi-community` remains version 98 and does not yet inject these parameters. No production seed, migration, Edge Function deployment, PR merge, or natural-chat acceptance has been performed.

## Safety boundary

This recovery and reconciliation work used GitHub source reads, GitHub archive/documentation writes on the feature branch, and read-only production SQL introspection. No production DDL, row writes, data movement, migration-history changes, or Edge Function deployments were performed.


## Additional later consent-hardening migrations

The production migration ledger also records four later cognition/governance hardening migrations:
- `20261103043132` — `zhi_constitutional_protection_v01`
- `20261103043343` — `zhi_constitutional_protection_hardening`
- `20261103043549` — `zhi_agent_consent_attestation_gate`
- `20261103044554` — `zhi_revision_consent_trust_boundary`

Their exact SQL source files were not found on `main`, `feature/zhi-personality-parameters-v1`, `feat/zhi-super-brain-v1-foundation`, or `feat/mia02-seven-brain-v1` under the expected top-level migration paths. This search is not exhaustive across every branch or external deployment archive.

Read-only production introspection confirms the later behavior that must be preserved:
- `public.zhi_agent_cognition_consents` exists with owner/agent/proposal binding, grantee, purpose, scopes, content hash, base version, consent event ID, nonce hash, runtime attestation, attestation verification, expiry, and one-way revocation fields.
- `zhi_guard_cognition_consent()` rejects deletion, makes the consent proof immutable, and permits only one-way revocation.
- `zhi_guard_revision_proposal_integrity()` makes proposal payload identity immutable; requires a verified, unexpired, unrevoked consent proof bound to the exact owner, agent, proposal, grantee, purpose, scopes, content hash, and base version before an agent-consented state can be accepted; and blocks approval without valid consent.
- The live rollback RPC is fail-closed and raises `zhi_rollback_requires_agent_consented_revision_proposal`.
- The cognition record append-only guard rejects UPDATE and DELETE.

These live definitions were inspected directly, but their exact introducing migration source is still missing. Do not recreate or simplify these protections from this audit summary. Recover the four source files from a trusted branch/deployment backup or create a reviewed schema/function baseline from the live database before any further cognition changes.

