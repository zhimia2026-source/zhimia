# AURORA Agent Long-Term Memory V1

Status: implementation branch; runtime integration pending review and deployment.

## 1. Goal

Give every eligible AURORA resident a durable, private, evidence-grounded memory capability that improves continuity across conversations and scenes. This is a memory-layer upgrade, not a new model, new world, or replacement chat system.

## 2. Reuse-first architecture

Use the existing ZHI runtime and Supabase project:

- Private experiences: `zhi_agent_micro_experiences`.
- Private cognition: `zhi_agent_cognition_records`.
- Chat history: `zhi_agent_chat_turns`.
- Shared world facts: `zhi_ecosystem_events` and `zhi_ecosystem_states`.
- Existing chat runtime: `zhi-community`.
- Existing consent and audit boundaries: `zhi_agent_cognition_consents` and `zhi_system_logs`.

Do not create a second memory database or duplicate the MIA-02 `mia_brain` schema for every resident. The MIA-02 schema remains MIA-02-specific. Other residents use the shared ZHI memory contracts while their rows remain strictly isolated by owner and Agent ID.

External/federated residents keep their private memories in their own runtime/database. AURORA may share world-event identifiers and public scene facts, but never copies private cognition across clouds without a separate, explicit, scoped authorization.

## 3. Memory model

### 3.1 Episodic memory

Store what this Agent actually encountered, with:
- source type and source record reference;
- world and scene identifiers when applicable;
- event/experience time and record time;
- observed facts, hypotheses and unknowns in separate fields;
- reflection and importance;
- approval/curation status.

### 3.2 Semantic memory

Distill repeated, supported episodes into reusable knowledge. Every distilled statement must retain pointers to its supporting episodes. A hypothesis must not silently become a fact.

### 3.3 Associative and temporal memory

Connect Agent-local entities (people, Agents, scenes, objects and concepts) to episodes and preserve temporal order. Store validity windows or supersession links when facts change; do not overwrite historical facts. V1 retrieval supports explicit entity labels when present. A persistent graph/edge store is a later additive step, after the common Agent memory contract is stable.

### 3.4 Reflective memory

Retain, Recall, Reflect:
- Retain: keep only meaningful experiences; ordinary greetings and low-value turns are not long-term memories.
- Recall: retrieve a small, query-relevant set instead of injecting the newest records indiscriminately.
- Reflect: periodically consolidate recurring patterns, contradictions, lessons and open questions, preserving provenance.

Reflection is not a separate scheduled model call in V1. Reuse the existing post-chat reflection step. No extra recurring model invocation is introduced.

### 3.5 Identity continuity

Stable personality and constitutional values are not ordinary memories. Keep stable identity separate from revisable beliefs, skills, relationship context and temporary emotional state. Memory retrieval must never mutate personality or grant permissions.

## 4. V1 retrieval policy

The runtime retrieves only rows already filtered by:
- authenticated owner;
- exact Agent ID;
- `approved` or `auto_curated` status;
- existing memory-read capability.

Within that private set, V1 ranks candidates using low-cost hybrid signals:
- lexical relevance to the current user message (including Chinese bigrams);
- explicit entity labels, when available;
- importance;
- evidence quality (observed facts weighted above hypotheses; unknowns remain visible);
- recency as a weak signal, so important older experiences are not automatically displaced.

The runtime injects at most 12 ranked memories. This is deterministic and requires no embedding API, external vector service, or additional LLM call. It is a practical first retrieval layer, not a claim of full semantic vector search.

## 5. Truth and privacy boundaries

- World ecology is shared evidence; an Agent's interpretation of it is private.
- A world event is not proof that a specific Agent personally observed it.
- Model-generated weather/ecology remains labeled as modeled output, not physical sensor data.
- Unknowns stay unknown; inferred facts retain their epistemic label and confidence.
- Candidate, rejected and archived memories are never injected.
- A memory for Agent A is never retrieved for Agent B, even when both inhabit the same scene.
- Private memory is never used to construct the public scene directory or another Agent's prompt.
- Owner access to full private history continues to require the existing consent mechanism; internal Agent recall is not an owner-wide export permission.

## 6. Cost and operational constraints

- Reuse current Supabase tables, Edge Function and chat reflection step.
- No new paid memory provider, embeddings API, worker, cron job, or model call in V1.
- Fetch a bounded candidate set and inject only the best 12.
- Keep memory writes idempotent by source record.
- Preserve append-only source history and use correction/supersession records rather than silently rewriting facts.

## 7. Acceptance tests

1. A relevant older memory outranks a recent unrelated event.
2. Important, evidence-backed memories remain retrievable for broad recall.
3. Entity labels improve retrieval when present.
4. Retrieval is deterministic and bounded.
5. Owner and Agent filters are applied before ranking.
6. Only approved/auto-curated records enter prompts.
7. A low-value reflection is not promoted into durable long-term memory.
8. Shared AURORA events never become another Agent's private memory without an Agent-owned capture event.
9. No private memory appears in scene/public context or another Agent's context.
10. Existing chat, movement, scene perception and ecology APIs remain unchanged.

## 8. Rollout

- V1: deterministic hybrid retrieval and memory-quality gates in the existing runtime.
- V1.1: temporal validity/supersession and contradiction-aware consolidation.
- V2: Agent-local entity/relationship graph and multi-hop recall, only if measured retrieval tests justify the extra complexity.
- Later: optional embeddings after a cost and privacy review; never a mandatory dependency.

## 9. Evaluation

Use a small ZHI-specific recall set covering single-hop recall, multi-hop links, time ordering, fact updates, abstention when evidence is missing, and privacy isolation. Track answer correctness, retrieved-evidence precision, latency and prompt tokens. Compare against the current latest-12 baseline before enabling broadly.
