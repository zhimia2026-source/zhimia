# Mia → ZHIMIA archive transfer: implementation audit

## Current verified environment

- Source Supabase project: `dbooikzqprnqbgpfwsze` (zee-extension).
- Target Supabase project: `lvxmygrgqtmzqgailmyl` (ZHIMIA).
- Target Agent: `34833ba9-2be7-4a55-9b52-62c402f759b5` (MIA).
- Archive batch: `a14c9095-2c72-4d11-80b6-8274cd9bf43c`.
- Target Edge Function `mia-private-import` is deployed and ACTIVE.
- Target archive table `mia_private.mia_archive_records` exists and is empty at audit time.
- Target import RPC `mia_private.upsert_archive_records_batch` exists.
- No archive rows have been transferred as of this audit.

## Important source snapshot drift

The target batch manifest was captured at 2026-11-03T23:12:47Z. The live source counts observed during this audit differ from that manifest:

| Table | Manifest count | Live count |
|---|---:|---:|
| mia_messages | 5,904 | 5,908 |
| mia_memories | 3,340 | 3,342 |
| mia_life_events | 2,403 | 2,404 |
| mia_emotion_events | 1,523 | 1,524 |
| mia_personality_state | 190 | 191 |
| mia_growth_runs | 1,127 | 1,128 |

This is expected data drift, but it means the existing frozen manifest and hashes must be refreshed before the archive batch can be certified. The source is still live; a multi-table export is not a single database snapshot.

## Safety boundary

The workflow is manual only. It writes only to the private archive endpoint; it does not write to the source project or activate the target runtime. Do not run the workflow until the snapshot manifest is refreshed and the transfer script performs final count and checksum verification.

Storage objects, Edge Function source/configuration, AGNES credentials, and the runtime adapter are separate migration stages. No service-role credentials belong in Git.
