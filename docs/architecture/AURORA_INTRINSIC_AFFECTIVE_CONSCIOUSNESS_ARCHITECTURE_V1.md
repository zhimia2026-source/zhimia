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
