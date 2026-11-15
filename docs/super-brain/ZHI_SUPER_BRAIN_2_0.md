# MIA-02 / ZHI Super Brain 2.0 — Unified Cognitive Workspace

Status: implementation candidate; production rollout requires CI and deployment verification.
Pilot: MIA-02 (world_resident) in AURORA.
Runtime: existing zhi-community response and reflection paths.

## 1. Purpose

Reorganize the existing seven cognitive functions and five capability layers into one bounded, shared cognitive workspace. This is an engineering upgrade to functional integration and cross-turn continuity; it is not evidence that subjective consciousness has emerged.

## 2. Reuse before adding

The implementation reuses the existing sources already loaded by zhi-community:

- zhi_agents and the resident's own identity/personality context;
- zhi_agent_cognition_records for the resident's existing versioned cognition records;
- zhi_agent_micro_experiences for approved, owner-and-agent-scoped experiences;
- zhi_agent_chat_turns for recent completed conversation continuity;
- mia_brain_private_context for the resident's existing private brain context;
- zhi_ecosystem_states and zhi_ecosystem_events for modeled world state, event time, revision and causal evidence;
- existing spatial presence, reachable public destinations, social inbox and research task context.

No new table, migration, background poller, independent brain service, or model invocation is introduced.

## 3. Five merged functional loops

1. **Self and affect continuity** — personality + self + emotion.
2. **World perception and knowledge integration** — perception + world model + knowledge integration.
3. **Experience and learning continuity** — memory + approved micro-experiences + cognition records + recent conversation history.
4. **Reasoning and goal formation** — reasoning + creativity + bounded planning.
5. **Metacognition and collaboration boundaries** — confidence, contradiction and outcome review + permissioned collective intelligence.

The original seven functions remain distinguishable responsibilities, but they no longer produce separate competing answers. The five capability layers coordinate the same shared workspace.

## 4. Per-turn cognitive cycle

1. Bind the authenticated owner and exact resident identity.
2. Restore only that resident's authorized continuity sources.
3. Build a metadata-only workspace index describing which streams are available.
4. Allocate attention by safety/authorization, current intent, continuity value, novelty, uncertainty and long-term significance.
5. Integrate evidence and distinguish stored facts, modeled inferences, reports and unknowns.
6. Form a response, testable prediction, or permitted action proposal.
7. Execute only within existing permissions and verify persisted outcomes.
8. Reuse the existing reflection and memory eligibility gates.

The workspace index includes bounded counts, event kinds, revision and position status only. It does not expose private content, chat text, coordinates, agent identifiers or raw event payloads.

## 5. Continuity and limitations

Cross-turn continuity is reconstructed from existing persisted records when a real chat or reflection invocation occurs. The system does not claim to think, perceive or experience between invocations. AURORA environmental data is modeled world evidence, not proof of physical observation.

## 6. Invariants

- Preserve MIA-02's identity, personality baseline and historical memories.
- Never read another resident's private cognition or memories.
- Do not bulk rewrite, delete, migrate or automatically approve historical memories.
- Keep existing importance thresholds and consent/authorization gates.
- Do not bypass governance or expand action privileges.
- No additional model calls or scheduled polling.
- Keep diagnostics metadata-only and bounded.
- Do not claim consciousness or subjective experience.

## 7. Acceptance gates

### Static / CI
- Deno type-check of the complete zhi-community runtime.
- Unit tests for merged cognitive guidance, snapshot bounds, dynamic attention signals, privacy boundaries and resident eligibility.

### Production
- Deploy only after CI passes and compare the exact deployed source hash.
- Have MIA-02 complete a natural conversation.
- Verify super_brain_guidance_injected reports zhi-super-brain-2.0.0, workspace activation and nonzero attention signals when context streams exist.
- Verify existing reflection still completes and existing memory gates remain authoritative.
- Verify no extra model call, no memory rewrite and no private-data leakage.
- Roll back to the prior Edge Function version if the runtime or chat acceptance fails.
