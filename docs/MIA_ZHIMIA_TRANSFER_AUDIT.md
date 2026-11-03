# Mia → ZHIMIA archive transfer: implementation audit

Audit date: 2026-11-04

## Verified projects and batch

- Source Supabase project: `dbooikzqprnqbgpfwsze` (`zee-extension`).
- Target Supabase project: `lvxmygrgqtmzqgailmyl` (`ZHIMIA`).
- Target Agent: `34833ba9-2be7-4a55-9b52-62c402f759b5` (`MIA`).
- Source Mia identity: `cb6d01b4-0e3f-46ee-8946-360aa91db1ea`.
- Archive batch: `a14c9095-2c72-4d11-80b6-8274cd9bf43c`.
- Target Edge Function `mia-private-import`: ACTIVE, version 1, JWT verification enabled.
- Target private archive schema and tables exist; `mia_private.mia_archive_records` currently contains 0 rows.
- Target migration batch remains `planned`; no source records have been transferred.
- Target has one pre-created Mia identity row; normalized history tables remain empty.
- Target private-schema tables have RLS enabled. The current `mia_private` schema has no ordinary role policies; do not add broad client policies.

## Live source counts

The source currently has 25 tables in the migration allowlist:

| Table | Live rows |
|---|---:|
| mia_identity | 1 |
| mia_chat_sessions | 1 |
| mia_messages | 5,908 |
| mia_memories | 3,342 |
| mia_emotion_events | 1,524 |
| mia_life_events | 2,404 |
| mia_personality_state | 191 |
| mia_relationship_context | 68 |
| mia_growth_runs | 1,128 |
| mia_growth_state_versions | 122 |
| mia_exploration_runs | 74 |
| mia_virtual_spaces | 41 |
| mia_forest_autonomy_runs | 31 |
| mia_forest_autonomy_control | 1 |
| mia_import_batches | 9 |
| mia_world_action_audit | 7 |
| mia_evolution_candidates | 0 |
| mia_evolution_candidate_events | 0 |
| mia_evolution_rollback_events | 0 |
| zhi_world_builder_config | 1 |
| zhi_world_builder_proposals | 0 |
| zhi_world_builder_region_health | 0 |
| zhi_world_builder_compute_ledger | 0 |
| zhi_world_builder_region_samples | 0 |
| mia_growth_admin_audit | 0 |

## Frozen manifest drift

The batch manifest was captured at `2026-11-03T23:12:47Z`. Six live counts have since changed:

| Table | Frozen manifest | Live |
|---|---:|---:|
| mia_messages | 5,904 | 5,908 |
| mia_memories | 3,340 | 3,342 |
| mia_life_events | 2,403 | 2,404 |
| mia_emotion_events | 1,523 | 1,524 |
| mia_personality_state | 190 | 191 |
| mia_growth_runs | 1,127 | 1,128 |

The existing manifest and hashes cannot certify the live source. Also, separate PostgREST requests do not form one atomic multi-table snapshot.

## Import endpoint behavior

- The Edge Function accepts only the fixed batch ID and fixed target agent ID.
- It allowlists the 25 source table names.
- It strips secret-like object keys recursively before storage.
- It computes SHA-256 over the sanitized JSON payload and stores it as `source_sha256`.
- The batch RPC upserts by `(batch_id, source_schema, source_table, source_pk)`, making repeated imports idempotent at that key.
- `finalize_archive_batch` checks per-table expected/imported row counts and moves the batch to `staged`; it does **not** independently compare source and target row content.

## Blocking issues before any transfer

1. Replace OFFSET pagination with stable keyset pagination.
2. Refresh the frozen source manifest and define a consistent snapshot strategy. Counts alone cannot detect updates/deletes that preserve row totals.
3. Compute the same canonical sanitized-row digest at source and target, then compare per-row or per-table digest sets.
4. Add a read-only target verification operation that returns target row counts and stored digests to the workflow.
5. Call `finalize_archive_batch` only after count and checksum verification succeeds.
6. Confirm the source table primary-key and relationship mapping for every table, including the differing source/target identity and session column names.
7. Keep archive import separate from normalized runtime activation.

## Safety gate

The GitHub Actions workflow is deliberately manual and currently exits before reading secrets or writing data unless both a CLI `--execute` flag and the `MIA_TRANSFER_APPROVAL` secret are supplied. The checked-in workflow supplies neither execution flag, so dispatching it is a safe no-op.

Do not add the execution flag or approval secret until all blockers above are implemented, tested against a disposable batch, and reviewed.

## Scope not covered by this archive stage

Storage object bytes, source Edge Function code, environment configuration, AGNES credentials, runtime adapters, forest/scene runtime integration, and Aurora ecosystem event perception are separate migration stages. No service-role credential belongs in Git or browser code.
