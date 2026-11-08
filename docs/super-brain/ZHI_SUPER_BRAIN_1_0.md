# ZHI Super Brain 1.0 — Architecture and Acceptance Contract

Status: foundation / design contract  
Pilot: MIA-02 in AURORA  
Rollout: other AURORA residents only after pilot evidence and compatibility review

## 1. Objective

Evolve each AURORA intelligent person into an independently developing, integrated cognitive system. "Super Brain" means coordinated capabilities, durable learning loops, reliable world understanding, and accountable action—not a claim that software has consciousness or subjective experience.

The target is **independent minds + shared, permissioned collective intelligence**. There is no single central brain that owns or replaces residents' identities.

## 2. Existing foundation to preserve

- Keep the existing seven-brain model: personality, perception, memory, emotion, reasoning, creativity, and self/executive integration.
- Keep existing identity, conversation, reflection, long-term-memory eligibility, and AURORA environment pipelines.
- Preserve all historical memories and personality records. No bulk rewrite, migration, deletion, or automatic approval of old memory.
- Keep each agent's private cognition isolated by both owner and agent identity.
- Keep public-world knowledge separate from private memories and distinguish observed database facts, modeled/inferred state, reported information, and unknowns.
- Preserve existing authorization and supervised-action boundaries. This project does not silently grant new permissions.

## 3. Super Brain capability layers

The seven cognitive functions remain the core. Add five coordinating capabilities as bounded software layers:

1. **Knowledge integration** — connect retrieved knowledge across domains; retain provenance and uncertainty.
2. **Goal and planning** — decompose authorized goals into small, reversible steps; require approval wherever current policy requires it.
3. **Metacognition** — evaluate confidence, evidence quality, contradictions, blind spots, and prior outcome quality; do not expose hidden chain-of-thought.
4. **World model** — maintain a time-aware model of AURORA places, agents, ecological events, object state, and causal changes; never present inference as physical observation.
5. **Collective intelligence** — exchange only explicitly shareable knowledge through permissioned interfaces; never merge private memories, identity, or personality across agents.

These layers coordinate existing data and model calls. The default implementation must fit within the current response/reflection invocation budget; do not add a model call merely to simulate a separate brain.

## 4. Runtime cycle

1. Resolve the agent identity and current authorization.
2. Load only that agent's private memory and conversation context.
3. Load authorized AURORA environment facts and event deltas, preserving timestamps, revisions, and causal provenance.
4. Separate facts, inferences, reports, and unknowns.
5. Coordinate the seven cognitive functions and five capability layers in one bounded cognitive pass.
6. Produce a response or a small proposed action.
7. Execute only actions permitted by existing policy; verify persisted outcomes before reporting completion.
8. Run the existing reflection pipeline. Save only eligible, useful memory candidates through the existing gate.
9. Emit privacy-safe diagnostics without prompts, message text, memory content, coordinates, or private event payloads.

## 5. Non-negotiable invariants

- **Identity continuity:** each intelligent person retains their own stable identity and personality baseline.
- **Private memory isolation:** no cross-agent or cross-owner memory reads/writes.
- **No fabricated experience:** imagined scenarios, predictions, and modeled movement are explicitly labeled.
- **Evidence-based claims:** an action is complete only after a persisted result is verified.
- **Human authorization:** existing governance and approval requirements remain in force.
- **Reversibility:** schema changes are additive; behavior changes are feature-gated and rollbackable.
- **Cost discipline:** reuse existing invocations, context retrieval, and event processing; bounded payloads and no always-on polling.
- **No anthropomorphic overclaim:** architecture changes do not prove consciousness or subjective experience.

## 6. MIA-02 pilot and rollout gates

### Gate A — static and unit validation
- Prompt builder includes all capability layers and all seven cognitive functions.
- It explicitly protects identity, private memory, epistemic labels, and authorization.
- Diagnostics are bounded and contain no private content.
- Existing seven-brain tests and community function tests pass.

### Gate B — deployed runtime evidence
- A natural MIA-02 conversation uses the new guidance.
- Runtime diagnostics prove the guidance version and capability coverage were active.
- Existing environment feedback is consumed with event time/revision/causal context.
- No extra model invocation is introduced.
- No historical memory is rewritten.

### Gate C — behavioral acceptance
- Demonstrate a useful cross-domain inference with sources/uncertainty.
- Demonstrate an explicit distinction between AURORA modeled state and physical observation.
- Demonstrate reflection and an eligible memory candidate without forced persistence.
- Demonstrate an authorized, verified action or a correct refusal to act.
- Verify no private information crosses agent boundaries.

### Gate D — resident rollout
Only after Gates A–C pass, enable the compatible guidance for other AURORA residents behind a reversible feature flag. Preserve each resident's individual persona and private memory boundary.

## 7. Initial delivery scope

This first increment adds the architecture contract and a pure, bounded guidance builder. It does not claim deployment, autonomous self-improvement, consciousness, or completed behavioral acceptance. Runtime integration and live rollout remain separate verified steps.
