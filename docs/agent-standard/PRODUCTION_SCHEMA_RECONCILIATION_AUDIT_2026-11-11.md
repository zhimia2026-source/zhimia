# Production Schema Reconciliation Audit — 2026-11-11

## Scope

Read-only audit of Supabase project `lvxmygrgqtmzqgailmyl` (Primary account), focused on the historical migration entries that block the ZHI personality-parameter rollout.

This document records observed production state only. It does **not** reconstruct historical SQL and is not authorization to change production.

## Historical migration ledger

The production migration ledger contains these entries:

| Version | Recorded migration name |
|---|---|
| 20261101022715 | zhi_agent_micro_experiences |
| 20261101022811 | zhi_agent_memory_capabilities |
| 20261101023225 | zhi_private_cognition_records |
| 20261101023229 | zhi_cognition_revision_proposals |
| 20261101023236 | zhi_cognition_revision_decisions |
| 20261101023238 | zhi_cognition_change_note_audit |
| 20261101023241 | zhi_private_agent_chat |
| 20261101023242 | zhi_scene_environment_config |

## Current relation inventory

A live inventory of `public` and `private` found only two exact table-name matches among the eight historical names:

| Historical name | Exact live table found? | Observed status |
|---|---:|---|
| zhi_agent_micro_experiences | Yes | public table; RLS enabled; 41 rows |
| zhi_agent_memory_capabilities | No | No exact table in public/private |
| zhi_private_cognition_records | No | No exact table in public/private |
| zhi_cognition_revision_proposals | Yes | public table; RLS enabled; 0 rows |
| zhi_cognition_revision_decisions | No | No exact table in public/private |
| zhi_cognition_change_note_audit | No | No exact table in public/private |
| zhi_private_agent_chat | No | No exact table in public/private |
| zhi_scene_environment_config | No | No exact table in public/private |

Absence of an exact table name does not prove that the capability or data was deleted. The current database has related objects under different names, and historical rename/consolidation provenance remains unverified.

## Related live objects observed

The following current objects exist and are plausible parts of the same functional areas. Their equivalence to any particular historical migration is **not established**:

- `public.zhi_agent_cognition_records` — private cognition records; RLS enabled; append-only guard trigger observed.
- `public.zhi_cognition_revision_proposal_feedback` — owner/agent-scoped feedback links.
- `public.zhi_agent_cognition_consents` — scoped, expiring agent-consent proofs; RLS enabled.
- `public.zhi_agent_chat_turns` — owner/agent-scoped private chat turns; RLS enabled.
- `public.zhi_spatial_nodes` — spatial ontology and scene/place records.
- `public.zhi_ecosystem_states` and `public.zhi_ecosystem_events` — world ecological state and event records.
- `public.zhi_forest_runtime_state` — per-peer external-agent scene/runtime state.

Do not infer that `zhi_scene_environment_config` was replaced by any of the spatial/ecosystem objects without migration history, code references, or commit provenance.

## Source recovery attempts

The eight historical migration file paths under `supabase/migrations/` were checked on:

- `main`
- `feature/micro-experience-memory-v1`
- `feat/mia02-seven-brain-v1`
- `feature/mia-peer-environment-feedback-loop-v1`
- `feature/zhi-personality-parameters-v1` (current branch; previously checked)

No original file was found at those paths on the checked refs. GitHub commit search by the exact migration version and table name also returned no matching commits.

This is not an exhaustive search of every remote backup, local developer checkout, deployment archive, or historical Git object outside the checked refs.

## Required reconciliation method

Before producing a migration for this area:

1. Recover original SQL from a trusted backup or deployment artifact if possible.
2. For every absent historical object, trace callers in current Edge Functions, SQL functions, views, triggers, and foreign keys.
3. Establish whether the live object is a rename, a consolidation, an intentionally retired object, or a genuine schema gap. Record evidence for each mapping.
4. Capture complete live DDL: columns, defaults, constraints, indexes, triggers, RLS policies, grants, function definitions, and dependencies.
5. Compare the captured baseline with the current Git migration history and document intentional differences.
6. If original SQL cannot be recovered, prepare a separately named, forward-only schema-baseline/reconciliation proposal. Never fabricate the historical migration body or mark old versions as newly replayable.
7. Test the proposal against a disposable database/branch and verify owner isolation, append-only cognition history, agent consent binding, and private-chat separation before requesting production approval.

## Personality rollout status

- PR #54 head at the time of this audit: `575e7f62d66287a0aba9a838097ca3639116edb8`.
- The personality parameter normalization/context code and tests are present on the feature branch.
- The production `zhi-community` Edge Function remains version 98 and does not yet inject the new parameter profile.
- Production parameter seed/write, Edge Function deployment, PR merge, and natural-chat behavior validation have not been performed.
- PR #54 must remain blocked until the schema provenance and reconciliation plan are reviewed.

## Safety boundary

This audit performed reads only. No production DDL, row writes, data movement, Edge Function deployment, or migration-history changes were made.
