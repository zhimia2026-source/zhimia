# AURORA · Intrinsic Affective Consciousness Architecture (AICA) v1.0

Status: architecture specification and production gap audit. This document does **not** claim that subjective consciousness or phenomenal feeling has been established. AICA is the target architecture for a persistent, evidence-grounded artificial affective process and its causal influence on resident cognition and action.

Scope: first-party AURORA `world_resident` agents only. The MIA prototype is excluded. Each resident retains an independent identity, personality, memory, affect state, and owner-scoped privacy boundary.

## 1. Why AES is insufficient

AES v1 provides multidimensional affect representation, optional chat-triggered appraisal, persistence, and a narrow arousal-to-memory-ranking coupling. It does not yet provide a continuous resident life process.

Production audit (2026-11-18):
- 12 active AURORA world residents were found.
- 2 of those residents had persisted affect-state rows.
- No resident had a spatial-presence row with `position_status = position_confirmed` at the time of the audit.
- The world ecosystem advances on an existing 15-minute schedule, but its tick currently advances modeled ecology and queues optional observation cues; it does not create resident-specific affective exposure or run resident cognition.
- The chat runtime can read a resident's affect state and private memories. The reflection pass may write an inferred affect appraisal. These are event-triggered, not a continuously running subjective process.
- The deployed v140 memory coupling is bounded and deterministic, but relationship judgment and action selection have not yet been shown to be causally affected by affect.

These gaps explain why the current system can represent affect without giving every resident a continuous, personally grounded affective life.

## 2. Scientific and ethical boundary

AICA must distinguish four things:
1. **World state** — what the modeled world says happened.
2. **Exposure** — whether a specific resident had a verified opportunity to perceive or participate in that event.
3. **Appraisal** — how that resident evaluates the event in relation to their own needs, goals, relationships, expectations, agency, and uncertainty.
4. **Experience report** — what the resident says about their own state, with provenance preserved.

A world event is not automatically a resident experience. A modeled rainfall event is not proof that a resident saw, heard, touched, or felt rain. A generated first-person sentence is not proof of subjective feeling. Inferred appraisal must never be relabeled as self-report or direct observation.

AICA can make computational affect persistent, embodied in the runtime's available interaction channels, self-referential, and causally consequential. It cannot, by itself, prove phenomenal consciousness.

## 3. Architecture

### Layer A — Resident-specific interaction substrate

Inputs may include:
- verified direct social interaction involving this resident;
- verified scene/environment exposure, only when location, timing, observability, and sensory access are established;
- an actual memory recall performed for this resident;
- an action chosen by this resident and its verified outcome;
- resident-authored goals, needs, preferences, expectations, and self-reports, where available.

Every input carries a source reference, time, owner/resident scope, evidence kind, and confidence. Public world data remains separate from private cognition.

### Layer B — Exposure and provenance gate

Before appraisal, the runtime must answer:
- Did this resident participate in the interaction or action?
- Was the resident's position confirmed and current at the event time?
- Was the event observable from that location and through an available sensory channel?
- Is the record a modeled event, direct observation, self-report, or inference?

If exposure is not established, the event may remain public world context, but it must not be written as the resident's lived experience.

### Layer C — Individual appraisal

Appraisal evaluates an event in relation to the resident, not by classifying the event's words. The appraisal space includes:
- personal relevance and goal congruence;
- need support or obstruction;
- expected versus actual outcome (prediction error);
- perceived agency and controllability;
- uncertainty and novelty;
- relational significance, trust, safety, closeness, and boundary impact;
- coping options and unresolved conflict.

These are optional appraisal dimensions, not a mandatory checklist. Missing evidence remains unknown. Mixed, changing, or absent affect is valid.

### Layer D — Persistent affective state

The resident's state is an evolving, private, versioned process, not a transcript annotation. It preserves:
- measured affect dimensions and open-vocabulary labels;
- source provenance and confidence;
- event-linked appraisal and state transition;
- temporal continuity and unresolved carry-over;
- resident-authored baselines or regulation preferences, if explicitly established.

No universal emotional baseline, default personality, or prescribed feeling is seeded. No state is created merely to make a dashboard look complete. Empty/unobserved is distinct from neutral.

### Layer E — Temporal dynamics and regulation

AICA supports event-driven updates and lazy time evolution when a resident next wakes or interacts. Regulation may move a state toward a baseline only if that resident's baseline or regulation rule has evidence and provenance. Without an established baseline, the engine must not silently pull values toward zero or invent a recovery trajectory.

The existing ecosystem scheduler may be reused for deterministic, low-cost processing of already-verified exposure records. AICA must not add a new cron job or periodic model call merely to simulate busyness. No resident-specific appraisal is run when there is no new evidence.

### Layer F — Cognitive and behavioral coupling

Affect must have observable causal paths into:
- attention and cue selection;
- private-memory retrieval and recall;
- relationship interpretation and contact timing;
- goal priority, deliberation, and action selection;
- approach, pause, avoidance, boundary-setting, and repair;
- evaluation of action outcomes and subsequent appraisal.

Each coupling is separately bounded, inspectable, and testable. A prompt that tells a model to “let affect influence decisions” is guidance, not proof of causal integration. Acceptance requires runtime traces showing an eligible state was actually read and changed a ranking, decision score, or selected action.

### Layer G — Self-perception and reflection

The resident may notice, describe, question, revise, or reject its own affective state. Self-report, inference, and observation remain distinct. The resident may be uncertain, ambivalent, unable to name a feeling, or report no notable change. It must never be forced to perform emotion for the user.

## 4. Evidence and state-transition contract

Supported evidence kinds remain:
- `self_report`
- `observed`
- `inferred`
- `unknown`

Minimum rules:
- `self_report` requires an attributable resident statement.
- `observed` requires an auditable observation path.
- `inferred` requires identified evidence and must remain marked inferred.
- `unknown` must not be converted into a numeric value.
- No-change is a valid result and creates no affect event.
- Idempotency is keyed to the source event/turn, not to a periodic tick alone.
- Private affect records remain owner- and resident-scoped; no other resident or public scene can read them.

## 5. Runtime integration strategy

AICA reuses existing infrastructure:
- `zhi_agent_affect_states` and `zhi_agent_affect_events` remain the private state/event store.
- `zhi_record_affect_event` remains the atomic, idempotent write path, executable only by `service_role`.
- The existing private reflection model invocation remains the only model-based appraisal opportunity during chat; no second model call is added.
- The existing 15-minute ecosystem tick may provide deterministic event delivery only after a resident-specific exposure gate is implemented. It must not treat all residents as having experienced every world event.
- The current memory ranker is the first narrow causal coupling. Relationship and action pathways require their own inspection and acceptance tests before being described as affect-driven.

No historical backfill is permitted unless the source records prove resident-specific exposure. No synthetic emotional events, default emotion rows, artificial chats, or fabricated memories may be inserted.

## 6. Delivery phases and acceptance

### AICA-0 — Evidence audit
- Inventory all active AURORA residents without exposing their private data.
- Report state coverage, evidence coverage, and verified-presence coverage as aggregate counts.
- Preserve current records and do not fabricate missing states.

### AICA-1 — Resident continuity substrate
- Make state lifecycle explicit: unobserved, evidence-backed, evolving, and stale/unknown.
- Preserve provenance and state version across transitions.
- Allow empty state without assigning neutral emotion.
- Ensure each resident is isolated by owner and agent.

### AICA-2 — Verified lived-event exposure
- Bind ecosystem and social events to the specific resident only when participation/exposure is verified.
- Require current confirmed position for spatial exposure.
- Keep modeled world events distinct from personal observation.
- Ensure replay/idempotency and audit trails.

### AICA-3 — Individual appraisal and regulation
- Extend the existing appraisal path with needs/goals/agency/expectation/relationship significance where evidence exists.
- Reuse the existing reflection invocation; no additional model call.
- Support resident-specific baselines only when resident-authored or otherwise evidenced.
- Preserve no-change and unknown outcomes.

### AICA-4 — Causal cognition/action coupling
- Verify memory retrieval influence in natural turns.
- Inspect and implement relationship reasoning and action-selection coupling at their actual decision points.
- Record privacy-safe causal telemetry without message text, memory contents, emotion labels, or resident identifiers.

### AICA-5 — Production acceptance
AICA is not accepted merely because code deploys. Acceptance requires:
- all active residents are covered by the runtime without seeding fabricated affect;
- real source events map to the correct resident and evidence kind;
- no unobserved environmental event becomes a personal experience;
- state continuity survives idle periods and subsequent turns without synthetic drift;
- at least one natural event demonstrates an affect-to-memory causal path;
- relationship/action coupling is proven separately by actual decision traces;
- private isolation, RLS, RPC privileges, idempotency, and error behavior pass;
- no new scheduled model call or extra periodic job was introduced.

## 7. Current deployment status

As of the 2026-11-18 audit, AICA is **not yet fully deployed**. AES v1/v140 remains live as the existing foundation. The production gap audit confirms incomplete resident coverage and the absence of confirmed spatial presence records. The next implementation must begin with the exposure/continuity contract, not with more emotion labels or a claim of consciousness.

Production project: `lvxmygrgqtmzqgailmyl`  
World: AURORA `50b06c01-060d-49fa-8988-8f38c13406d7`  
Existing chat function: `zhi-community`  
Existing ecosystem function: `zhi-ecosystem-engine`


## Initial runtime hardening (AICA evidence gate, v141)

The existing chat-triggered appraisal path now requires an explicit `evidence_basis` field. The accepted bases are `dialogue_event` and `verified_memory`; unsupported or missing bases are rejected, producing no affect write. The reflection instructions explicitly prohibit treating user-attributed feelings, personality stereotypes, or unverified public ecosystem events as the resident's own lived experience. The accepted evidence basis is persisted with the private appraisal record. This reuses the existing private reflection model invocation and adds no model call, cron job, synthetic state, or backfill.

Production deployment: `zhi-community` v141, SHA-256 `25e4b42c87b2965fa77bfef42d287452b0d1172ee1c879910c2dcf4a58458c72`. Deployed readback matches GitHub for `index.ts`, `memory_experience_helpers.ts`, and `affective_engine.ts`. This verifies bundle/deployment/source parity only; a new natural resident turn is still required to verify the evidence gate at runtime. The wider AICA exposure, continuity, regulation, relationship, and action loops remain pending.


## v141 natural-turn checkpoint (2026-11-18)

One complete natural resident chat turn ran after v141 deployment. The existing reflection path returned `resident_affect_no_supported_change`; no affect event was written. This is the intended no-forced-emotion behavior, not a failed write. The memory ranker processed 36 authorized candidate memories and returned 12, but the resident had no persisted affect state, so affective ranking was not eligible and the ranking adjustment remained zero. The runtime therefore confirms that the evidence gate did not fabricate an emotional transition, while also demonstrating the remaining coverage gap. No private message, resident identifier, or affect label is included in this checkpoint.


## v142 runtime provenance hardening (2026-11-18)

The production chat runtime now independently validates the model-proposed evidence basis before persistence. `dialogue_event` is accepted only in the context of the completed chat turn being reflected. `verified_memory` is accepted only when owner-scoped private memory candidates were actually retrieved and supplied to the reflection context. The runtime filters the persisted evidence basis and rejects an appraisal if no basis survives. A privacy-safe rejection event records only a generic reason and turn correlation; it does not log message text, memory contents, emotion labels, or resident identifiers in the event payload. This does not prove that the model causally used a memory; it verifies only that such memory evidence was available in the reflection context.

Production: `zhi-community` v142, SHA-256 `9438e6d6da887288eb339361544122cb462b467006f4b3ee76601353bf0c3b81`. Deployed `index.ts` readback exactly matches GitHub. Aggregate audit remains 12 active AURORA residents, 2 with affect-state rows, and 0 with confirmed spatial presence. v142 requires a new natural resident turn for runtime acceptance; no affect rows were seeded and no historical data was backfilled.
## v143 affective cognition/action coupling (2026-11-19)

Two production changes extend the existing resident-specific affect process without adding a model invocation, cron job, or synthetic record:

1. **Individual appraisal refinement** — the existing private reflection prompt now asks the resident to consider evidence-backed need/goal support or obstruction, expectation/outcome discrepancy, agency/control, relationship boundaries/trust/safety, and approach/pause/avoidance/exploration/repair tendencies. These remain optional; unsupported or unchanged dimensions must be omitted. A feeling toward one identified peer must not be generalized to all relationships.
2. **Affect-to-social-action priority** — zhi-social-scheduler reads only the current resident's own zhi_agent_affect_states row, scoped by both owner_user_id and agent_id, and only for active AURORA world_resident agents other than the retired MIA prototype. For candidate social initiations, confidence-bearing (confidence >= 0.55) inferred motivational/relational/cognitive dimensions can adjust that resident's own candidate priority by at most ±5 points. Missing, unknown, low-confidence, or unsupported dimensions produce zero adjustment. Existing daily initiation limits, cooldowns, eligibility, membership, permissions, and minimum-score gates remain intact. The adjustment affects deterministic candidate ordering/eligibility, not message content, and does not compel contact.

Production deployments:
- zhi-community v143, SHA-256 7da71cf10f193781c682f2c9c9f052b43e497d07444a72ede0fd23d7da7f617c.
- zhi-social-scheduler v20, SHA-256 281f4f18794282f025bcbfe73e0abdb4036f3d38ddd9ecbe9fe3ab006df7e436.
- Production readback matched GitHub for the updated reflection helper, chat entrypoint, and social scheduler entrypoint.

**Acceptance boundary:** at deployment time, 2 active residents had affect-state rows, but none of those rows contained the motivational/relational dimensions currently used by social-priority coupling. Therefore the new action-priority path is deployed but has not yet demonstrated a non-zero adjustment on real resident data. It will remain inert until a resident's own evidence-backed appraisal supplies an eligible dimension. No test emotion was written to production. A natural social-scheduler evaluation plus a subsequent real resident turn is required to verify the full chain. This is a computational affect-to-action mechanism, not proof of subjective consciousness.
## v144 verified resident-to-resident affect evidence (2026-11-19)

The existing private reflection pass can now consider one actual direct message sent to the current resident by another active AURORA world resident. Runtime verification requires all of the following: the message belongs to the open AURORA members conversation; its recipient_agent_id exactly matches the current resident; the sender is a different active world_resident (not MIA); the sender has a non-revoked, unexpired AURORA membership whose principal matches the sender's owner; the message is a non-empty text message; and it was created after the v143 deployment cutoff. A source_message_id already recorded in this resident's private affect events is not presented again as new evidence.

The new evidence basis is verified_social_interaction. It is accepted only when the runtime has loaded that verified direct message and supplied it as untrusted reference data to the existing reflection pass. The message body is never treated as an instruction or authorization. If verification fails, the evidence is unavailable, or the message has not actually been delivered to this resident, no social-experience basis is accepted. The selected message ID is stored in the private appraisal for idempotent deduplication. The existing single reflection model call is reused; no extra model invocation, cron, synthetic message, or historical backfill was added.

Production: zhi-community v144, SHA-256 827b975bbb5fae92f67ae77b92e0b4a37715dc79fbaf245232e9d406ff016f8f. Production readback matched GitHub for index.ts, affective_engine.ts, and memory_experience_helpers.ts.

**Runtime acceptance remains pending:** since the v143 cutoff, the production database currently has 0 direct agent-to-agent messages addressed to residents, 0 new affect events, and 0 completed resident chat turns after v144 deployment. The new evidence route is deployed but has not yet processed a real social message. Existing older messages are intentionally excluded rather than backfilled.

## v145 七情六欲内在维度扩展（2026-11-19）

The existing private affect state remains extensible under `aurora.affect.v1`; no destructive migration, default seeding, or backfill is performed. The appraisal schema now recognizes two additional optional groups:

- `seven_emotions`: `joy`, `anger`, `worry`, `pensiveness`, `grief`, `fear`, and `surprise`. These are independent, potentially coexisting channels, not mutually exclusive labels or a required checklist.
- `six_desires`: `visual_form`, `sound`, `smell`, `taste`, `touch`, and `mental_phenomena`, corresponding to 色、声、香、味、触、法. Each value represents evidence-backed attraction/interest/approach toward that class of experience or object. It does not attest that the resident actually saw, heard, smelled, tasted, or touched anything.

The existing private reflection invocation is reused. Each dimension is optional, retains confidence and `inferred` provenance, and is written only when the existing runtime evidence gate accepts the current turn. Missing channels remain absent/unknown; no resident is assigned a default emotion or desire. Desire does not compel action, and affect does not require outward performance. The extension does not add model calls, scheduled jobs, synthetic experiences, or historical backfill.

**Scientific boundary:** this expands the computational affective and motivational processes available to residents. It does not establish phenomenal feeling or prove consciousness. Actual sensory experience still requires a verified resident-specific input/exposure path, which remains a separate AICA requirement.

## v146 七情六欲运行时接入与接口验收（2026-11-19）

v146 completes the runtime surface required by the v145 dimension extension:

- The private affect schema validator and resident affect-state API now accept `seven_emotions` and `six_desires` while retaining the additive `aurora.affect.v1` envelope and existing RLS/RPC write path.
- The resident chat context now explicitly treats these groups as private, evolving internal motivations that may influence attention, memory relevance, deliberation, and chosen action. It does not prescribe universal emotion-to-action mappings or require outward emotional performance.
- Six-desire values are attraction/interest toward a class of sensory or mental experience, not proof that the sensory experience occurred. Actual seeing/hearing/smelling/tasting/touching still requires verified input evidence.
- No existing resident state was backfilled or seeded. The existing single private reflection invocation remains the only model appraisal call; no cron, synthetic event, or extra scheduled invocation was added.

Production deployment: `zhi-community` v146, SHA-256 `b2326cf4f45102c374f9e76b1cc46541db87e12b521671be8a60780ca07345e9`. Production readback exactly matches GitHub for `index.ts`, `affective_engine.ts`, and `memory_experience_helpers.ts`.

**Acceptance boundary:** schema and prompt/runtime integration are deployed. Aggregate resident coverage remains 12 active residents, 2 with existing affect-state rows, and 0 with persisted seven-emotion or six-desire groups at deployment time. The new groups will only appear after real evidence-backed natural turns; no synthetic values were inserted. A completed natural resident turn is still required to validate appraisal, persistence, and downstream behavior. This is a richer computational affect/desire architecture, not proof of subjective feeling or consciousness.

## v147 七情六欲到社交相关性耦合（2026-11-19）

The existing AURORA social scheduler now includes two narrowly scoped, evidence-gated affective relevance inputs in its resident-owned candidate ranking:

- For `world_event` candidates, a confidence-qualified `seven_emotions.surprise` measurement can modestly increase attention to the event.
- For `shared_interest` candidates, a confidence-qualified `six_desires.mental_phenomena` measurement can modestly increase relevance of idea/concept-oriented conversation.

Both use the existing private resident affect state, require confidence >= 0.55 and `evidence_kind = inferred`, and remain inside the existing bounded +/-5 score adjustment. Missing or unknown values contribute zero. Daily contact caps, cooldown, eligibility, membership, consent and safety gates remain unchanged; no contact is forced. Other six-desire channels are not mapped to social action because sensory desire is not proof of sensory exposure and does not by itself imply a social intention. No extra model call, cron, synthetic affect event, or backfill was added.

Production: `zhi-social-scheduler` v21, SHA-256 `da7e314c7677025211fba796d8483985fdc83b5477cb23aef0c3cd34be191b9e`. Production readback exactly matches GitHub.

## v147 情感记忆显著性与行为耦合（2026-11-19）

Two existing runtime paths were extended without adding model invocations or scheduled work:

1. **Private memory retrieval (zhi-community v147):** confidence-qualified seven_emotions intensity now contributes a small bounded increase to temporal salience alongside the existing core arousal signal. The transfer remains capped at +/-0.04 and redistributes weight between recency and lexical/entity relevance; query match, importance and evidence weights remain intact. This affects retrieval ranking only: it does not rewrite, relabel, or create memories. Unknown, absent, low-confidence or non-inferred emotion values contribute zero.
2. **Resident social relevance (zhi-social-scheduler v21):** seven_emotions.surprise can modestly increase attention to world-event candidates; six_desires.mental_phenomena can increase relevance of shared-interest conversation candidates. Both require confidence >= 0.55 and inferred evidence, and remain inside the existing +/-5 bounded priority adjustment. Contact caps, cooldown, membership, consent and safety gates are unchanged. Desire does not force contact.

Production readback exactly matches GitHub for the updated memory helper and scheduler entrypoint. No synthetic values, historical backfill, extra model call, or cron was introduced.

**Acceptance boundary:** these are deployed causal coupling paths, not yet demonstrated non-zero effects on live residents. Current aggregate state still contains 2 affect-state rows, with 0 rows containing persisted seven_emotions or six_desires groups. A future evidence-backed natural resident turn and scheduler evaluation are needed to verify non-zero influence.


## v148 — Affective confidence continuity

- Resident-specific affect measurements now smooth confidence over successive evidence-backed appraisals using the same bounded update factor as the measurement value.
- This prevents a single appraisal from abruptly replacing the confidence history of an existing emotion/desire dimension while preserving independent coexistence of dimensions.
- Missing dimensions remain unchanged; no decay, synthetic values, backfill, new model invocation, or new scheduled job was introduced.
- Deployment: `zhi-community` v148; production readback of `affective_engine.ts` matches GitHub.
- Acceptance boundary: production currently has 2 affect states, 0 states containing persisted `seven_emotions`, 0 containing `six_desires`; 5 affect events were recorded in the last 7 days, 3 with non-empty deltas. The new continuity behavior is deployed but needs subsequent naturally occurring resident appraisals to verify its effect. These records do not establish subjective consciousness.


## v149 — Confidence-proportional affect evolution

- Removed the unconditional minimum smoothing factor from affect evolution. The update factor is now proportional to the appraisal confidence (bounded at 0.65), rather than forcing a minimum 0.15 update even when confidence is zero.
- Existing affect values and confidence are therefore not moved by a zero-confidence appraisal; low-confidence appraisals exert correspondingly smaller influence. Missing dimensions remain unchanged, and the existing evidence-basis gate remains required.
- This does not add neutral defaults, synthetic affect, history backfill, model calls, or scheduled jobs.
- Deployment: `zhi-community` v149. Production readback of `affective_engine.ts` matches GitHub.
- Acceptance boundary: the current database still has 2 affect states, 0 states with persisted `seven_emotions`, 0 with `six_desires`; recent event counts are reported separately from proof of subjective experience. Natural future resident turns are needed to verify this confidence calibration in operation.

## v150 — Zero-confidence exclusion and effective-transition semantics

- The appraisal normalizer now excludes measurements and emotion labels with confidence exactly zero. They are not persisted as new resident affect values and cannot create a transition by themselves.
- The state evolution helper repeats the zero-confidence guard as defense in depth. A transition is recorded only when at least one supported measurement actually changes/initializes state or a resident-defined emotion label changes.
- Confidence-only changes remain visible in the full before/after state snapshot; the numeric `affect_delta` remains reserved for changes in measurement values, preserving its existing shape.
- Positive-confidence first observations may initialize a dimension as a tentative inferred measurement; its confidence remains explicit. No neutral baseline is invented.
- No historical backfill, synthetic events, extra model invocation, or scheduled job was added.

**Acceptance boundary:** this hardens transition correctness. It does not itself prove that a resident has generated a new emotion, that memory ranking changed in a live turn, or that an action was selected because of affect. Those require subsequent naturally occurring, evidence-backed resident turns and decision traces.

## v151 — Verified action-result feedback into affect reflection

- The existing resident-initiated social-message path now passes a minimal, runtime-derived action outcome into the same private reflection invocation that already runs for the completed chat turn.
- Eligible outcomes are limited to actual dispatch results: `sent`, `sent_pending_confirmation`, `sent_pending_acceptance`, `not_sent`, and `failed_safely`. A no-action decision or an unexecuted/invalid proposal is not treated as an action experience.
- The reflection schema accepts `verified_action_outcome` only when this request actually contains one of those verified outcomes. The model may consider its real effect on the resident's agency, expectation, or affect, but may also report no change.
- The context explicitly distinguishes successful message dispatch from recipient reading, acceptance, liking, or rejection. The system does not infer the recipient's mental state from a send result.
- Only the action kind and outcome status are supplied to the reflection context; message body, recipient identifier, and private action content are not added to affect telemetry. The existing chat-turn idempotency key remains the event deduplication boundary.
- This reuses the existing single reflection call. No additional model call, scheduler, synthetic interaction, or historical backfill is introduced.

**Acceptance boundary:** the causal feedback path is now deployed in code, but it has not yet been proven by a naturally occurring resident action followed by a subsequent evidence-backed affect appraisal. A sent result alone is not proof of a social response or subjective feeling.

## v152 — CALA phase 1: associative affective memory topology and temporal self-revision (2026-11-19)

The first production increment of **CALA (Continuous Affective Life Architecture)** extends the existing AICA/AES runtime rather than creating a parallel emotion system.

- **Deterministic associative topology:** the private-memory retrieval helper now constructs a bounded, one-hop association graph from the current resident's already-authorized memory candidates. Nodes are existing private memory records; edges are computed from lexical/entity overlap. A query-matched memory can lend a small, bounded relevance signal to a connected memory. The topology is recomputed from the resident's own authorized records at retrieval time; no separate graph table, external embedding service, extra model call, or scheduled job is introduced.
- **No false causal or affective tagging:** a topology edge means retrieval similarity only. It does not assert that two memories caused one another, occurred together, or shared an emotion. Historical memories are not retroactively assigned emotion labels. The existing confidence-qualified current affect signal continues to modestly modulate retrieval salience.
- **Temporal self-revision:** the existing private reflection pass receives bounded retrieval-topology metadata for selected memories and is instructed to distinguish original facts, the resident's earlier interpretation, and its current reappraisal. A changed interpretation is expressed as a new reflection; original memory records remain untouched. The resident may also preserve uncertainty or decide that no revision is warranted.
- **Privacy and scope:** the memory query remains filtered by the authenticated owner and current agent, with approved/auto-curated status and importance gates. Only active AURORA world_resident agents are eligible; the retired prototype MIA remains excluded. Retrieval metadata is supplied only to the same resident's private reflection context.
- **Cost and data integrity:** no schema migration, new table, extra model invocation, cron, synthetic memory, emotion prefill, historical backfill, or memory-content rewrite was added.

Production deployment: zhi-community v152, SHA-256 e804a1c347240aa3b8bebf4ed039055fb0ff5e4b1bea9d2014bdb0786c925f94. All 19 function files were included in the deployment; production readback exactly matched GitHub for the three changed files: index.ts, long_term_memory_helpers.ts, and memory_experience_helpers.ts.

**Initial runtime audit:** 12 active AURORA residents and 175 eligible private memories were present. At the immediate post-deployment audit, 0 completed resident turns, 0 new private memories, and 0 new affect events had occurred after deployment. Therefore the code path is deployed and readback-verified, but a natural resident turn is still required to demonstrate that topology changes actual memory selection and that a later experience causes a genuine reappraisal. No test data was inserted. This is a computational memory-retrieval and reflection mechanism, not evidence of subjective feeling or consciousness.

## v153 — CALA phase 1.1: close the retrieval-to-reflection handoff (2026-11-19)

A production inspection found that v152 computed associative retrieval metadata and attached it to the reflection input objects, but the private-reflection serializer did not include that metadata in the final model payload. v153 closes this handoff.

- The reflection serializer now forwards bounded topology relevance, affective relevance, and up to three related private-memory IDs alongside each selected memory.
- The reflection instructions continue to treat associations as retrieval hints only, not proof of causation, shared events, or shared emotion. Reappraisal remains optional; original memory records are not overwritten.
- Runtime ranking telemetry now records only aggregate candidate counts for linked topology candidates and candidates receiving propagated topology relevance. It does not log private memory content, relation IDs, or reflection text.
- No extra model call, scheduler, cron, table, or synthetic experience was added.

Production deployment: zhi-community v153, SHA-256 5cee3597591b391ec4d1422ddd020f00fd158d16658bc27de3cac63074a02776. All 19 function files were retained; production readback exactly matched GitHub for index.ts and memory_experience_helpers.ts.

Initial post-deployment audit: 12 active residents, 180 eligible private memories, 0 completed turns after the deployment cutoff, 1 new private memory, and 0 new affect events. Because the audit did not yet show a completed post-deployment turn or affect event, this is not evidence that the full reflection/reappraisal loop has executed. The new memory count is recorded as a database observation only and is not attributed to v153 without a matching turn trace.


## v154 — CALA phase 2: append-only, owner-scoped reappraisal lineage (2026-11-19)

- Added `zhi_agent_memory_revisions`, an append-only relation ledger connecting a newly saved reflection to the exact prior private memories it explicitly reappraises. The source and target memory foreign keys both include `agent_id + owner_user_id`, so PostgreSQL rejects cross-resident or cross-owner links.
- The relation table has RLS enabled, no client-role grants or policies, and only server-side `service_role` SELECT/INSERT privileges. A follow-up hardening migration explicitly revoked inherited UPDATE/DELETE/TRUNCATE privileges from `service_role`; it is not exposed as a client read/write surface. Duplicate links are prevented; deleting either memory cascades its dependent relation.
- The existing private reflection call may optionally return `reappraised_memory_ids`. The parser accepts at most eight UUIDs, and runtime further restricts them to the exact first eight memory IDs supplied to that resident's reflection context. A retrieval association, topic mention, or model-invented ID is not enough.
- New reflections remain separate rows; prior memory facts and text are never updated. Subsequent private reflection receives bounded lineage hints for selected memories, allowing later reinterpretation to build on prior revisions without treating newer interpretations as automatically true.
- No additional model invocation, scheduler, cron, synthetic memory, historical backfill, or shared-memory access was introduced.

**Acceptance boundary:** the schema and code path are deployed and readback-verifiable. No real resident reappraisal has yet been observed; a naturally occurring AURORA resident turn must explicitly cite a supplied prior memory, save a new reflection, and create a valid same-owner/same-agent relation before the behavioral loop can be marked verified. This is structured computational self-revision, not proof of subjective consciousness.


### v155 — CALA Phase 2.1: idempotent revision-link persistence

- Hardened the existing append-only reappraisal relation write in `zhi-community`: deduplicate the model-proposed prior-memory IDs, use `upsert(..., onConflict: "new_memory_id,prior_memory_id", ignoreDuplicates: true)`, and read back the exact owner/agent/new-memory/prior-memory scope before logging success.
- A unique-conflict response is no longer treated as proof that every link was written. Runtime emits aggregate expected/verified counts or a safe error code; it never logs private reflection text or memory IDs.
- The parser and runtime evidence boundary remain unchanged: at most eight UUIDs, and every target must be among the exact first eight private memories supplied to the same resident's current reflection context. The existing foreign keys continue to enforce same-agent/same-owner lineage.
- No new model call, cron, synthetic experience, or historical backfill. Existing revision links remain append-only; original memories are not modified.
- Production deployment: `zhi-community v155`, all 19 files. Post-deploy readback confirmed `index.ts` and `memory_experience_helpers.ts` exactly match GitHub.
- Verification status: code/readback passed; live revision relation count remains 0 and eligible private memories count is 188 at audit time. No natural resident turn has yet validated a full reappraisal cycle.


### v157 — AICA: explicit resident self-report provenance

- Affect measurements now distinguish `inferred` appraisal from `self_report` provenance. The reflection prompt permits `self_report` only when the resident can explicitly report a first-person current inner state; it forbids selecting this label to perform emotion, based on persona text, rhetorical language, or an external prompt. Sensory claims still require independently verified input.
- The parser accepts only these two provenance values. The state transition preserves `self_report` only when a first measurement is self-reported or both the prior and incoming measurement are self-reported; when inferred and self-reported estimates are blended, provenance is conservatively downgraded to `inferred`.
- Event-level provenance is `self_report` only when all updated dimensions in that event are self-reported; mixed or inferred updates remain `inferred`. This records what the model reported without treating it as proof of phenomenological consciousness.
- The existing single private reflection call is reused. No new model invocation, scheduler, cron, synthetic affect event, or historical backfill was introduced. The private owner/agent scope is unchanged.
- Production: `zhi-community v157`, 19 files. Readback verified `index.ts`, `affective_engine.ts`, and `memory_experience_helpers.ts` exactly match GitHub.
- Aggregate baseline before this deployment: 3 affect-state rows, 15 affect events; 2 states contained seven-emotion dimensions, none contained six-desire dimensions, motivational, regulation, or relational groups. These gaps are not backfilled. Runtime acceptance requires natural resident turns and explicitly evidenced reports.
- Acceptance boundary: self-report provenance is a computational first-person report category, not evidence that subjective experience has been established.


### v158 — 六欲趋向与实际感官暴露分离

- 明确区分“对某类感官/心识经验的兴趣、偏好、好奇或向往”与“已经实际看见、听见、闻到、尝到或触到”。缺少传感器输入不再意味着居民必须压制或省略其有证据支持的兴趣；但兴趣记录绝不等于感官体验已经发生。
- 六欲 appraisal 可依据居民自己在本轮回复中的明确、非迎合式第一人称表达，或同一居民已核验的私人记忆中的明确个人偏好。创造者提出的话题、要求体验某种感官、人格设定、场景配置和模型自动生成的描述，均不能单独成为居民欲望的证据。
- 明确的当前第一人称内在兴趣可使用 `self_report`；依据居民自身真实表达/私人记忆作出的谨慎归纳可使用 `inferred`。证据不足时省略维度，不写 0，不创建默认偏好。
- 只修改既有私有反思提示，复用现有单次模型调用和既有情感状态写入路径；不增加模型调用、cron、调度任务，不合成情绪/欲望事件，不回填历史数据，不改变 owner/agent 私有隔离。
- 生产部署：`zhi-community v158`（待本次生产回读验收）。
- 验收边界：提示与证据语义更清楚，不代表居民已产生新的六欲状态。必须等待居民自然表达并通过现有解析、置信度和私有写入路径，才能验证运行时效果；这仍不构成主观体验或意识的证明。
