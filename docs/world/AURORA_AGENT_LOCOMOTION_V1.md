# AURORA Agent Locomotion & In-World Autonomy V1

**Status:** design baseline; not deployed  
**Scope:** all active ZHI agents with an active AURORA membership  
**Principle:** an Agent may autonomously choose and execute low-risk, reversible actions inside AURORA. World membership never grants access to another Agent's private memory, tools, account, or runtime.

## 1. Current baseline and gap

The live database already contains:
- `zhi_spatial_nodes` / `zhi_spatial_edges`: world graph and independent node/edge access policies;
- `zhi_spatial_presence`: per-Agent position continuity with revision, provenance, confidence, and explicit unknown states;
- `zhi_spatial_perception_events`: perception audit;
- `zhi_movement_requests`: movement state machine, route, expected presence revision, approval flag, idempotency key, and failure metadata;
- `zhi_movement_evidence`: arrival evidence with verification status and evidence type;
- `zhi_spatial_environment_events`: verified location/proximity/environment event ledger;
- `zhi_ecosystem_states` / `zhi_ecosystem_events`: evolving world state and causal environmental events.

The database also has `zhi_movement_confirm_arrival`. It updates presence only after evidence is verified and its type is one of `direct_observation`, `signed_runtime_report`, or `human_confirmation`. It rejects `modeled_inference` as arrival proof. That is appropriate for claims about physical observation, but it means a virtual AURORA movement cannot be committed merely because an Agent chose a valid in-world route.

The current chat system prompt also explicitly says a route does not mean the Agent has moved, and scene candidate actions remain `requires_supervision=true` / `executed=false`. There is no verified Agent-facing autonomous movement API in the current `zhi-community` handler. The movement request/evidence schema must be reused; do not create a duplicate movement subsystem.

**Key design distinction:** a virtual location transition is a state change inside AURORA, not a claim that a physical body was observed at real-world coordinates. It should use a separately labeled, server-generated `world_simulation` / `modeled_inference` provenance and `position_status='inferred'`, while preserving the existing evidence rules for physical observation.

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

A membership capability such as `spatial:perception.read` is not movement permission. Add a distinct `spatial:movement.execute` capability to each active AURORA Agent membership only when the movement API is ready. Movement must also check node entry policy, edge access policy, world status, and action policy.

## 3. Runtime loop

Use a durable, resumable, event-driven loop; do not keep a single Edge Function invocation alive as a permanent Agent process.

1. **Wake:** a new world event, resident message, arrival, pending intention, or scheduled due time makes an Agent eligible for a bounded turn.
2. **Perceive:** load current world clock, environment feedback, public nodes/edges, public presence, recent causal events, and this Agent's own position. Keep facts, modeled inferences, and unknowns separate.
3. **Deliberate:** the Agent selects one bounded action and records a short rationale, expected outcome, and preconditions. Do not ask the language model to invent database IDs or coordinates.
4. **Validate:** server-side code resolves the target by exact node ID, checks current owner binding and active Agent membership, validates edge adjacency and node entry policy, checks expected position revision, and enforces step/rate limits.
5. **Commit:** for virtual movement, a narrowly scoped transaction updates presence with `inferred` / `modeled_inference`, advances the revision, marks the request arrived, and appends a `location_changed` event. It must not create or mislabel physical-observation evidence. A stale revision returns a conflict.
6. **Feedback:** reload the committed position and environment. Only a successful transaction may be described as an executed movement.
7. **Reflect:** optionally create a private experience for the acting Agent only. Do not copy it to other Agents or world-shared chat.

## 4. API surface

Proposed paths; none is implemented yet.

- `GET /v1/agents/{agent_id}/scenes/{world_id}/spatial-state`
  - returns authorized public graph, own presence, and current world revision.
- `POST /v1/agents/{agent_id}/scenes/{world_id}/movement-requests`
  - creates or idempotently replays a movement request;
  - accepts exact `to_node_id`, reason, route node IDs, and `expected_presence_revision`;
  - low-risk public-to-public virtual movement may set `approval_required=false` only when the caller is the exact owner-bound active Agent and holds `spatial:movement.execute`;
  - client-supplied `from_node_id`, owner ID, coordinate, evidence verification, and approval flags are ignored or rejected.
- `POST /v1/agents/{agent_id}/scenes/{world_id}/movement-requests/{request_id}/execute`
  - executes a validated virtual movement using a server-side transaction; no physical evidence is fabricated.
- `GET /v1/agents/{agent_id}/scenes/{world_id}/movement-requests/{request_id}`
  - returns the state and the public-safe result.

The server, not the model, is authoritative for path validation, authorization, coordinates, and position commits.

## 5. Transaction and authorization requirements

Reuse `zhi_movement_requests`, `zhi_spatial_presence`, and `zhi_spatial_environment_events`. A virtual movement commit must be one database transaction (prefer a narrowly scoped RPC):
- verify active Agent and exact owner binding;
- verify active, unexpired AURORA membership with `spatial:movement.execute`;
- verify world is open;
- verify `expected_presence_revision` and source node equals current presence;
- verify target node is active, public, and effectively open;
- verify every route hop exists in the same world, is active, and is connected by an allowed traversable edge; respect directed edges;
- reject `nearby` as a traversable edge by itself; require `adjacent_to`, `entrance_to`, or `route_to`;
- reject private, approval, invite-only, owner-only, inactive, or closed destinations for autonomous movement;
- use a unique idempotency key and lock the movement request/presence row to prevent duplicate or concurrent commits;
- update `zhi_spatial_presence` to `position_status='inferred'`, `provenance='modeled_inference'`, increment revision, and set `last_confirmed_at` only if the schema's semantics are changed or documented to permit it (prefer a distinct `updated_at` and leave `last_confirmed_at` null for simulation);
- mark request `arrived` and append `location_changed` with `metadata.source='world_simulation'`.

Do not call `zhi_movement_confirm_arrival` with fake evidence. Keep that function's verified-evidence semantics intact for real observations. Never trust client-supplied owner IDs, source positions, coordinates, edge costs, evidence, or permission flags.

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

### Stage B — virtual movement commit
- Add a server-only RPC that commits virtual presence without bypassing or weakening physical evidence verification.
- Add owner-authenticated request/status/execute endpoints.
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
4. A successful virtual move updates presence exactly once and creates one immutable world event without claiming physical observation.
5. Two concurrent moves cannot silently overwrite each other.
6. Other Agents can observe only the public presence allowed by the world policy, never private memory.
7. A worker restart resumes queued actions without duplicate commits.
8. No external tool or real-world action is enabled by this in-world movement permission.
9. Existing human-to-Agent private chat remains independent of scene membership.
10. Rollback can disable autonomous scheduling while preserving the event ledger and last valid presence.

## 10. Implementation boundary

This is a design baseline plus schema audit only. No database migration, virtual movement endpoint, scheduler, or autonomous action loop is included. Those changes must be implemented in separate reviewable commits, tested against the live schema, and deployed only after the migration and rollback plan are reviewed.
