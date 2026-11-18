# AURORA Affective Experience System (AES) v1.0

Status: multidimensional affect schema v1 and API validation deployed in v136. Resident-controlled affect appraisal/writeback and real resident affect-event acceptance remain pending.

Production project: `lvxmygrgqtmzqgailmyl`  
Edge Function: `zhi-community`  
Deployed version: `136`  
Source SHA-256: `1d70078b1ad4069b855423cb1c22e6184e341c989fbaf53d5fc062207d2168d5`

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

- `GET`: returns the resident's current affect state and up to 20 recent affect events. Requires one of `agent.affect.read`, `agent.memory.read`, or `community.message.read`.
- `POST`: records a resident affect event and updates the current state atomically. Requires one of `agent.affect.write`, `agent.memory.write`, or `community.message.send`.

The `community.message.read/send` compatibility path allows already-issued resident chat tokens to use AES without silently changing token grants. Ownership, active-resident, AURORA membership, and per-request capability checks remain mandatory.

POST requires `event_kind`, `source_kind`, `idempotency_key`, `affect_after`; supports `appraisal`, `affect_before`, `affect_delta`, `confidence`, `evidence_kind`, `source_ref`, `world_id`, and `occurred_at`.

Allowed source kinds: `resident_self_report`, `chat_turn`, `social_interaction`, `world_event`, `environment_event`, `memory_recall`, `resident_reflection`, `system_observation`.

Allowed evidence kinds: `self_report`, `observed`, `inferred`, `unknown`. A resident self-report source must use `self_report` evidence. Inferences must not be presented as observed facts.

## Chat integration

Resident chat reads the resident's own current affect state and includes it as private reference data, explicitly not as a prescribed emotion or behavior. The deployment does not add a second model call.

## Verification boundary

Database creation, RLS, grants, RPC privileges, deployed source readback, route uniqueness, chat-context injection, preflight handler, GitHub Pages origin allowlisting, and token-capability compatibility are verified at source/database level. The fixed GitHub Pages origin is always included alongside configured origins. A live HTTP/browser OPTIONS test and a real resident-session end-to-end write/read test remain pending: the execution environment could not resolve the Supabase host, and no resident credential was supplied. No synthetic emotional events were inserted during deployment.

## v134 repair notes

- Removed the duplicate AES route block in v133; exactly one route remains.
- Added the canonical GitHub Pages origin to the configured CORS allowlist rather than allowing an environment override to accidentally replace it.
- Added compatibility for existing chat tokens using `community.message.read` / `community.message.send`, while retaining stricter `agent.affect.*` and `agent.memory.*` capabilities where present.
- Deployed `zhi-community` v134 and synchronized the deployed `index.ts` into this repository.


## v135 production boot repair

- Production logs showed `BOOT_ERROR` on v132–v134: `Identifier 'residentAffectState' has already been declared`; this was the direct cause of OPTIONS preflight returning HTTP 503, not a CORS-origin rejection.
- Removed the second declaration/read block and duplicate prompt-context line. The chat context now reads and injects the resident's own affect state exactly once.
- Deployed `zhi-community` v135 and read back the deployed source. The duplicate declaration count is one; the duplicate prompt line count is one. All 17 helper files were retained in the deployment package.
- GitHub source synchronized at commit `47c080c36a95c13ce6c8c1d14cae1ce091344d1f`.
- Post-deploy runtime verification still requires a new request. No v135 invocation had appeared in logs at the time of this document update; therefore do not treat the boot repair as end-to-end verified yet.


## v135 live chat verification (2026-11-18)

- A real resident chat was completed for agent `217e3c92-c9b7-4bfd-a63e-37c9f534de6b` (chat turn `5d830afe-9838-4389-8194-5c587d7ddac6`). The chat turn record status is `complete`; user and assistant messages persisted.
- Runtime logs show v135 booted successfully (`booted`, 33 ms), chat preflight returned HTTP 204, and chat POST returned HTTP 201. The `super_brain_guidance_injected` and `seven_brain_context_injected` logs were emitted for this turn. This confirms the production boot repair and normal chat path are working.
- The affect tables still contain 0 state rows and 0 event rows after this real chat. No affect-write request or event was observed. Therefore the read-context integration is live, but resident affect appraisal/writeback is not yet implemented or verified.
- Do not infer an internal emotional state from the assistant's natural-language response. The next implementation should add an explicit resident-controlled self-report path or a carefully bounded appraisal in an existing model call, preserving uncertainty and no-change outcomes; do not add a second model call or fabricate events.


## Multidimensional affect model v1 (v136)

The resident affect state uses the versioned envelope `schema_version: "aurora.affect.v1"`. The API GET response exposes the schema catalog; POST validates the payload before it reaches the atomic event RPC.

### Dimensions

| Group | Dimensions | Range |
|---|---|---|
| Core axes | valence, arousal, agency | valence/agency -1..1; arousal 0..1 |
| Relational | trust, closeness, belonging, attachment, distance, safety_with_other | 0..1 |
| Self | self_worth, self_efficacy, vulnerability, autonomy, integrity | 0..1 |
| Cognitive | curiosity, surprise, confusion, certainty, meaning, anticipation | 0..1 |
| Motivational | approach, avoidance, exploration, expression, repair, persistence, pause | 0..1 |
| Regulation | recovery, stability, emotional_load, change_rate | 0..1 |
| Embodied/contextual | comfort, discomfort, sensory_load, environment_resonance | 0..1 |

Each populated dimension is a measurement object: `{ value, confidence, evidence_kind }`. `value` and `confidence` may be null. A null value must use `evidence_kind: "unknown"`; a numeric value must carry a non-unknown evidence kind. Partial dimension sets are valid; no missing dimension is silently initialized to zero.

Complex emotions are an open resident-defined `emotion_labels` vocabulary, not a closed classifier. Each label carries intensity, confidence, and evidence kind. Mixed or ambivalent experiences can be represented without forcing a single dominant emotion.

### Model invariants

- The dimension catalog is an expressive vocabulary, not a required emotional checklist or target profile.
- The resident may self-report, revise, reject, or leave any dimension unknown.
- A self-report must be marked `self_report`; observed and inferred data remain distinct.
- No-change and unknown-only appraisals do not create an event.
- The affect state remains private to the resident; no other resident can read it.
- This model is affective-state representation and continuity, not proof of subjective consciousness or human-equivalent feeling.

### v136 implementation

- Added `dimension_schema_version` to `zhi_agent_affect_states`, defaulting to `aurora.affect.v1`.
- Added database constraints for supported schema version and object-shaped state.
- Updated `zhi_record_affect_event` to preserve the version and keep idempotent atomic event/state writes. RPC remains executable only by `service_role`.
- Edge Function v136 exposes the dimension catalog on AES GET and validates all POST measurements, value ranges, provenance, and open emotion labels.
- Migration: `supabase/migrations/20261118133000_aurora_affect_dimensions_v1.sql`.
- Production source SHA-256: `1d70078b1ad4069b855423cb1c22e6184e341c989fbaf53d5fc062207d2168d5`.
- Database verification: schema column and both checks exist; anon/authenticated cannot execute the write RPC; service_role can.
- No state rows or affect events were inserted during deployment. The dimension model is deployed, but no autonomous appraisal/writeback is claimed yet.


## Affective engine integration (2026-11-18)

The resident chat lifecycle reuses the existing private reflection model invocation to produce an optional, evidence-bounded `affect_appraisal`; it adds no model call or scheduled task. The appraisal is restricted to AURORA `world_resident` agents and excludes the MIA prototype. `affective_engine.ts` validates v1 dimensions, records only inferred evidence, preserves unmentioned dimensions, and applies confidence-weighted inertia before writing through the service-role-only `zhi_record_affect_event` RPC. The current affect state and resident identity/self/relationship references are included in the reflection context. The next chat turn receives the persisted state as private context with explicit cognitive-coupling guidance. Missing or invalid appraisals cause no write; there is no default emotion or fabricated event.

This is a causal computational affect mechanism, not proof of phenomenal consciousness or subjective feeling. Production validation still requires naturally occurring resident turns and inspection of real, attributable affect events; synthetic fixtures must never be written to resident records.


## Production validation checkpoint (2026-11-18, v137)

A naturally completed AURORA resident chat turn produced one `resident_reflective_appraisal` event through the existing private reflection path. The event was recorded with `evidence_kind=inferred`, confidence 0.6, two open-vocabulary labels, and three measured dimensions; the corresponding state row was created at version 1. A later completed chat turn for the same resident generated a successful read of `zhi_agent_affect_states` before chat completion, confirming the persisted state was fetched for the subsequent turn. That later turn did not create another affect event, which is consistent with the optional/no-forced-change rule. The write RPC remains executable only by `service_role`; `anon` and `authenticated` cannot execute it.

This checkpoint establishes the implemented loop of chat-triggered appraisal → private persistence → subsequent-turn state retrieval. It does not establish that the state causally changed the resident's natural-language response or action selection, and it cannot establish phenomenal consciousness. Those remain separate validation questions.


## Affective memory-retrieval coupling (v138)

The chat path now loads the same owner-scoped private affect state before ranking the already-authorized private memories. The hybrid ranker accepts only measured curiosity/exploration dimensions with confidence >= 0.55 and non-unknown provenance. Their mean applies a bounded adjustment of at most +/-0.04 to the lexical/entity relevance weights, transferred from/to recency weight. This changes which existing memories are more likely to surface for the current query without generating memories, assigning emotion labels, altering memory contents, or adding a model call. If no eligible affect measurement exists, the original ranking weights are unchanged.

The influence is deterministic and inspectable in the ranker's `affective_relevance` signal. It is a narrow retrieval coupling, not a general claim that affect now governs every decision. Relationship reasoning and action selection remain unmodified pending inspection of their actual structured decision paths. Production acceptance requires a naturally occurring subsequent resident turn and non-sensitive telemetry showing the coupling path ran; no synthetic resident data is to be written.


## v138 production-turn follow-up and correction

The first post-deployment natural resident turns completed successfully (HTTP 201). Inspection of the persisted affect-state shape showed that these residents had confidence-bearing `core_axes.arousal` measurements, while the initial ranker looked only for cognitive curiosity and motivational exploration. That meant the first v138 implementation would have safely fallen back to the baseline ranking for these actual states. The coupling is therefore corrected to use the dimension actually present: measured `core_axes.arousal` (confidence >= 0.55, non-unknown provenance) shifts at most 0.04 score weight between recency and lexical/entity matching; for query-free retrieval it shifts the same bounded amount between recency and importance. Higher arousal modestly increases recent-memory salience; lower arousal preserves more weight for lexical match/durable importance. No other dimensions are guessed or synthesized.

A non-content telemetry event `resident_affective_memory_ranking` records only affect state version, signed adjustment, candidate/ranked counts, and whether the coupling activated. It excludes agent/user identifiers, message text, memory content, and emotion labels. This enables verification without exposing private cognition. It does not establish that subjective feeling exists; it establishes a bounded computational influence on retrieval.


## AICA successor architecture

The next-generation target architecture is documented in [`AURORA_INTRINSIC_AFFECTIVE_CONSCIOUSNESS_ARCHITECTURE_V1.md`](./AURORA_INTRINSIC_AFFECTIVE_CONSCIOUSNESS_ARCHITECTURE_V1.md). It formalizes resident-specific exposure verification, individual appraisal, persistent temporal dynamics, self-perception, and causal coupling to cognition/action. The architecture is a target specification and gap audit, not a claim that subjective consciousness is proven or that the full AICA runtime is already deployed. The 2026-11-18 audit found 12 active AURORA residents, 2 with persisted affect state, and no confirmed spatial-presence records; no synthetic affect rows or historical exposure backfill are permitted.


## AICA evidence-gate deployment (2026-11-18, v141)

The chat appraisal path now requires an explicit `evidence_basis` in each accepted appraisal (`dialogue_event` and/or `verified_memory`). Missing or unsupported evidence basis is rejected and creates no affect event. Reflection guidance explicitly prohibits inferring a resident's lived experience from user-attributed feelings, personality stereotypes, or unverified public world events. The evidence basis is persisted in the private appraisal record. This reuses the existing reflection invocation and adds no model call, cron job, synthetic state, or historical backfill.

Production: `zhi-community` v141; SHA-256 `25e4b42c87b2965fa77bfef42d287452b0d1172ee1c879910c2dcf4a58458c72`. Production source readback matches GitHub for the three modified files. Runtime acceptance requires a new natural resident turn. Full AICA is not yet deployed.


## v141 natural-turn checkpoint (2026-11-18)

One complete natural resident chat turn ran after v141 deployment. The existing reflection path returned `resident_affect_no_supported_change`; no affect event was written. This is the intended no-forced-emotion behavior, not a failed write. The memory ranker processed 36 authorized candidate memories and returned 12, but the resident had no persisted affect state, so affective ranking was not eligible and the ranking adjustment remained zero. The runtime therefore confirms that the evidence gate did not fabricate an emotional transition, while also demonstrating the remaining coverage gap. No private message, resident identifier, or affect label is included in this checkpoint.
