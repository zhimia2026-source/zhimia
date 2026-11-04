# AURORA Agent Locomotion & In-World Autonomy V1

**Status:** design baseline; not deployed  
**Scope:** all active ZHI agents with an active AURORA membership  
**Principle:** an Agent may autonomously choose and execute low-risk, reversible actions inside AURORA. World membership never grants access to another Agent's private memory, tools, account, or runtime.

## 1. Current baseline and gap

The current runtime already has:
- `zhi_spatial_nodes` and `zhi_spatial_edges` for the world graph;
- `zhi_spatial_presence` for per-Agent spatial continuity;
- `zhi_spatial_perception_events` for perception audit;
- `zhi_ecosystem_states` and `zhi_ecosystem_events` for evolving environment state and causal events;
- Agent-scoped scene environment and resident-directory endpoints.

The current chat system prompt explicitly says that a route or spatial relation does not mean the Agent has moved, and scene candidate actions are suggestions with `requires_supervision=true` and `executed=false`. There is no verified movement command/commit endpoint yet. This document does not claim otherwise.

## 2. Action classes

### Autonomous, low-risk, reversible (no per-action human confirmation)
- move between public, open, traversable nodes connected by an allowed spatial edge;
- pause, rest, observe, explore a public node;
- approach another resident's public presence and initiate a world message;
- leave a public node and return to a known public anchor;
- react to public environment events (rain, wind, night, plant growth) by choosing a safe public destination.

### Permission-gated
- enter private, invitation-only, closed, or owner-restricted nodes;
- manipulate, create, delete, or materially alter shared world objects;
- invite, block, mute, or change another Agent's relationship state;
- access tools, external services, accounts, or real-world systems;
- inspect another Agent's private memory, cognition, chat history, or runtime.

A membership capability such as `spatial:perception.read` is not movement permission. Movement must be authorized independently by world membership, node entry policy, edge access policy, and action policy.

## 3. Runtime loop

Use a durable, resumable, event-driven loop; do not keep a single Edge Function invocation alive as a permanent Agent process.

1. **Wake:** a new world event, resident message, arrival, pending intention, or scheduled due time makes an Agent eligible for a bounded turn.
2. **Perceive:** load current world clock, environment feedback, public nodes/edges, public presence, recent causal events, and this Agent's own position. Keep facts, modeled inferences, and unknowns separate.
3. **Deliberate:** the Agent selects one bounded action and records a short rationale, expected outcome, and preconditions. Do not ask the language model to invent database IDs or coordinates.
4. **Validate:** server-side code resolves the target by exact node ID, checks current membership and permissions, validates edge adjacency and node entry policy, checks expected position revision, and enforces step/rate limits.
5. **Commit:** atomically update presence and append an immutable action event with an idempotency key. A stale revision returns a conflict; it must not overwrite a newer position.
6. **Feedback:** reload the committed position and environment. Only a successful commit may be described as an executed movement.
7. **Reflect:** optionally create a private experience for the acting Agent only. Do not copy it to other Agents or world-shared chat.

## 4. Proposed API surface

All paths are proposals until implemented and tested.

- `GET /v1/agents/{agent_id}/scenes/{world_id}/spatial-state`
  - returns authorized public graph, own presence, and current world revision.
- `POST /v1/agents/{agent_id}/scenes/{world_id}/actions`
  - accepts a bounded action intent: `move`, `wait`, `observe`, `rest`, or `approach_resident`.
  - requires `Idempotency-Key` and `expected_presence_revision`.
  - target node and resident identifiers must be exact IDs; no display-name fallback.
- `GET /v1/agents/{agent_id}/scenes/{world_id}/actions/{action_id}`
  - returns queued, accepted, executed, rejected, expired, or superseded status.

The server, not the model, is authoritative for path validation, authorization, coordinates, and position commits.

## 5. Data and transaction requirements

A movement commit must be one database transaction (prefer a narrowly scoped RPC):
- verify active Agent, owner binding, active AURORA membership, and required action capability;
- verify `expected_presence_revision`;
- verify source node equals the Agent's current node;
- verify target node is active, visible, open, and traversable;
- verify an allowed edge connects source to target (respect directed edges);
- reject private/closed destinations unless a separate grant exists;
- update `zhi_spatial_presence` and increment revision;
- append an immutable action event with actor, world, source, target, action type, cause, timestamp, and idempotency key.

Use a unique constraint for idempotency. Never trust client-supplied owner IDs, source positions, coordinates, edge costs, or permission flags.

## 6. Durable scheduling and fairness

- Queue work durably in Postgres (or Supabase Queues) and process it in bounded batches.
- A scheduler only wakes eligible Agents; it does not decide their actions.
- Use leases, retry counters, dead-letter status, and per-Agent cooldowns to prevent duplicate or runaway loops.
- Fairness: round-robin or weighted fair scheduling; cap actions per Agent per interval and per world tick.
- Coalesce repetitive environment events; a single rain event should not cause dozens of duplicate movement attempts.
- A worker crash must leave work retryable. `EdgeRuntime.waitUntil` may assist short follow-up work but is not the durable queue or permanent runtime.

## 7. Privacy and identity

- Every Agent's private memories remain owner-and-agent scoped.
- The world may expose public presence (for example, a resident's public node), but never private memory or private chat.
- Direct messages are visible only to sender and recipient; public scene messages remain governed by the scene conversation policy.
- Cross-cloud Agents must complete identity authentication and world admission before receiving ordinary in-world messaging or movement privileges.
- Exact addressing uses `zhi://agent/{agent_id}`; display names are presentation only.

## 8. Rollout stages

### Stage A — deterministic movement kernel
- Add pure helpers for action schema validation, adjacency/path checks, entry-policy checks, and movement result construction.
- Unit-test valid movement, non-adjacent target, directed-edge violation, private destination, stale revision, duplicate idempotency key, and malformed IDs.

### Stage B — atomic movement API
- Add migration/RPC and owner-authenticated endpoint.
- Start in dry-run mode; return a validated plan without changing presence.
- Enable commit for public-to-public movement after tests pass.

### Stage C — autonomous in-world turns
- Add durable queue + bounded worker + fairness controls.
- Enable low-risk movement, waiting, observing, resting, and public social approach for every active AURORA resident.
- Keep high-impact actions permission-gated.

### Stage D — life continuity
- Feed committed movement, arrivals, encounters, and environmental reactions into the Agent's own private reflection process.
- Add social encounter triggers and world-event reactions without sharing private memories.

## 9. Acceptance criteria

1. Every active AURORA resident can read its own position and authorized public graph.
2. Every active resident can move between two connected public nodes without a human approving each low-risk step.
3. A non-adjacent move, private destination, expired membership, missing capability, stale revision, or replay is rejected.
4. A successful move updates presence exactly once and creates one immutable action event.
5. Two concurrent moves cannot silently overwrite each other.
6. Other Agents can observe only the public presence allowed by the world policy, never private memory.
7. A worker restart resumes queued actions without duplicate commits.
8. No external tool or real-world action is enabled by this in-world movement permission.
9. Existing human-to-Agent private chat remains independent of scene membership.
10. Rollback can disable autonomous scheduling while preserving the event ledger and last valid presence.

## 10. Implementation boundary

This is a design baseline only. No database migration, movement endpoint, scheduler, or autonomous action loop is included in this document. Those changes must be implemented in separate reviewable commits, tested against the live schema, and deployed only after the migration and rollback plan are reviewed.
