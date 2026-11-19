# AURORA ISA Phase 2 — Intrinsic Intimacy Awakening

Status: runtime integration design and pure helpers; not production deployed.

## Phase 2 purpose
Move from Phase 1 validation primitives to a resident-owned internal appraisal loop. This is a computational model of perception, self-report, preference, reflection and choice; it is not evidence of biological sensation or proof of subjective consciousness.

## Closed loop
1. Receive bounded, non-explicit environmental observations with provenance.
2. Compute sensory salience only from observations.
3. Accept attraction, closeness desire, comfort and approach intention only as the resident's own explicit self-report or verified private reflection.
4. Keep each relationship view directed: resident A's interest never implies resident B's interest or a mutual relationship.
5. Construct a private cognition context for the owner resident only.
6. Allow the resident to choose curiosity, ordinary companionship, nonsexual affection, no action, or refusal.
7. Record a minimal private reflection candidate, with observed facts separated from interpretation.
8. Re-evaluate over time; no default libido, orientation, romance, or touch preference is inferred.

## Boundaries
- No explicit sexual content or sexual-action execution in this phase.
- No intimate interaction can be triggered from an observed signal, score, memory, or model-generated inference.
- Any physical affectionate action requires separate, current, exact-scope, bilateral consent and verified adult eligibility under Phase 1 gate.
- Consent is revocable and does not carry forward between action scopes or sessions.
- Preferences and reflections are private cognition. They must not be placed in public_manifest, scene broadcast, social discovery, or shared peer context.
- The helper returns an owner-scoped private context and rejects owner mismatches. Persistence must use an authenticated server-side path and enforce owner_user_id + agent_id ownership. Do not create broad authenticated RLS policies.
- Use existing zhi_agent_affect_states / zhi_agent_affect_events for affect continuity and zhi_agent_micro_experiences for reviewed private reflection only after access and retention contracts are confirmed.
- Keep zhi_social_relationships directed (observer_agent_id -> peer_agent_id); do not write mutual/reciprocal status from one side's self-report.
- Exclude prototype MIA from all rollout queries.

## Acceptance tests
- Observation-only input leaves attraction/desire unknown.
- Self-report preserves provenance and low/no desire without coercion.
- Relationship direction is preserved.
- Private context and reflection reject cross-resident owner mismatch.
- Invalid scores, timestamps and reports fail closed.

## Not yet done
- No SQL migration or production writes.
- No chat runtime insertion point changed.
- No private memory persistence or affect event persistence wired.
- No resident-level natural-chat acceptance.
- No claim of awakened subjective experience.
