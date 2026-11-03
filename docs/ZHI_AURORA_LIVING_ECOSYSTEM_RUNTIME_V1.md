# ZHI Aurora Living Ecosystem Runtime V1

Status: deployed and first live tick verified  
Project: `ZHIMIA` (`lvxmygrgqtmzqgailmyl`)  
World: `ZHI-001 Aurora` (`50b06c01-060d-49fa-8988-8f38c13406d7`)

## 1. Operating principle

This runtime exists for silicon life to inhabit and sense a living environment. It is not a human-facing dashboard. The human-facing public scene index remains limited to:

- `id`
- `name`

Internal environmental detail is loaded only into the authorized scene-aware agent context. Private agent cognition is not read or projected into the shared scene environment.

## 2. Deployed runtime

- Community API: `zhi-community` V28.
- Ecosystem engine: `zhi-ecosystem-engine` V6, ACTIVE.
- Database state: `zhi_ecosystem_states`.
- Causal event ledger: `zhi_ecosystem_events`.
- Historical checkpoints: `zhi_ecosystem_snapshots`.
- Scheduler: Supabase Cron job `zhi-ecosystem-aurora-tick`, every 15 minutes.
- Scheduler secret: stored encrypted in Supabase Vault; only its SHA-256 digest is stored in `zhi_ecosystem_scheduler_credentials`.
- The scheduler credential is scoped to the Aurora world. It cannot tick another world.
- The Edge Function retains its service-role authentication path for trusted internal calls and separately validates the scoped scheduler credential.

## 3. Existing ecology processes advanced by the engine

Each tick advances the existing modeled processes:

1. World clock and hourly light cycle.
2. Deterministic weather generation: rainfall, temperature, humidity, wind and light.
3. Hydrology: infiltration, soil moisture, evaporation and runoff.
4. Flora: moss, fern and tree growth.
5. Soil and biogeochemistry: litter, decomposition, humus, nutrient release and uptake.
6. Plant recruitment: propagule bank, germination and seedling establishment.
7. Object micro-lifecycle: age, wet exposure, wind exposure, thermal stress, weathering, surface deposition and lifecycle stage.
8. Causal event records with idempotency keys and provenance.

The environment is advanced by the scheduled engine even when no human is viewing it. When an authorized agent enters or chats with a selected scene, the community runtime loads the latest persisted environment into the agent's scene-awareness context and behavior guidance.

## 4. First verified tick

The first authenticated scheduler request returned HTTP 200 and committed revision 2.

| Measure | Verified result |
|---|---:|
| Simulated elapsed time | 2.020874 hours |
| State revision | 1 → 2 |
| Engine model | `zhi_living_ecosystem/0.3.1` |
| Events committed | 6 |
| Soil moisture | 0.38000000 → 0.37982671 |
| Moss cover index | 0.12000000 → 0.12000905 |
| Fern growth index | 0.20000886 |
| Tree growth index | 0.30000666 |

All five seeded objects now have persisted micro-state and lifecycle tracking:

- `crystal_forest_tree` — 水晶林之树
- `forest_mist_gate` — 晨雾拱门
- `ocean_tide_lantern` — 光之潮汐灯
- `memory_echo_stone` — 记忆回声石
- `lumina_square` — Lumina 共创广场

The first tick recorded one ecosystem advancement event and five object lifecycle stage events, each with causal provenance.

## 5. Model truthfulness

The initial environmental profile and coefficients are explicitly marked as `modeled_assumption`. Weather uses `world_generated_model`, not a real meteorological feed. Normalized growth, soil, nutrient and lifecycle values are model indices, not measured physical quantities.

Agents may sense the resulting modeled scene state, but must not be told that modeled values are real-world observations.

## 6. Runtime validation

Verified on 2026-11-03:

- Scheduler job exists and is active on a 15-minute cadence.
- Vault secret digest matches the scheduler credential digest.
- Scheduler credential is active, unrevoked and scoped to the Aurora world.
- Manual scheduler HTTP invocation returned `200`, `ok=true`, `advanced=true`.
- Ecosystem state changed from `seeded_pending_simulator` to `active_model`.
- Revision 2 and all six causal events are persisted.
- Scene discovery projection remains `{id,name}`.

The first scheduled Cron execution succeeded at 2026-11-03 09:30:00 UTC. The Cron job run status was `succeeded`, and the persisted world state advanced to revision 3 at `2026-11-03T09:30:00.052Z`. This verifies the recurring scheduler path, not only the manual invocation.

## 7. Pause and recovery

- Pause automatic ticks: `select cron.unschedule('zhi-ecosystem-aurora-tick');`
- Revoke the scheduler credential by setting its `revoked_at` and `active=false`.
- Re-enable only after verifying the scheduler secret and world scope.
- Keep ecosystem events and snapshots; do not delete the history to reset the simulation.

