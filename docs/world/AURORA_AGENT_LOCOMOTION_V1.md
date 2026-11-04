# AURORA Agent Locomotion & In-World Autonomy V1

**Status:** design and live-schema audit; movement automation not deployed  
**Scope:** all active ZHI agents with an active AURORA membership  
**Principle:** Agents may autonomously choose and execute low-risk, reversible actions inside AURORA. World membership never grants access to another Agent's private memory, tools, account, or runtime.

## 1. Current deployed baseline

The live project already has a movement subsystem; do not replace it with a duplicate.

- `zhi-spatial` v8: owner-authenticated spatial perception and presence endpoints.
- `zhi-movement` v3: owner-authenticated movement request state machine at `/v1/agents/{agent_id}/movement`.
- `zhi-aurora-world-runtime` v2: read-only world bridge for the external MIA peer; only `perceive` and `status` are accepted and its response explicitly sets `movement_enabled=false`.
- `zhi_movement_requests`: request state, route, approval flag, expected presence revision, idempotency key.
- `zhi_movement_evidence`: typed evidence and verification state.
- `zhi_spatial_presence`: per-Agent position continuity, provenance, and revision.
- `zhi_spatial_environment_events`: location/proximity/environment event ledger.
- `zhi_spatial_nodes` / `zhi_spatial_edges`: world graph and node/edge access policy.
- `zhi_ecosystem_states` / `zhi_ecosystem_events`: evolving world state and causal environmental events.

### Existing movement API behavior

The deployed `zhi-movement` v3 flow is:
1. `action=request` creates `awaiting_approval` and always sets `approval_required=true`;
2. `action=approve` requires the human token's `community.scene.create`;
3. `action=begin` moves the request to `executing`;
4. `action=evidence` and `verify_evidence` collect/verify arrival evidence;
5. `zhi_movement_confirm_arrival` updates presence only for verified `direct_observation`, `signed_runtime_report`, or `human_confirmation`.

This is a supervised, evidence-gated movement workflow. It is not yet autonomous virtual locomotion.

### Current spatial blockers found in the live database

- AURORA has 12 active spatial nodes and 11 active edges.
- All 11 edges currently have relation `contains`; there are zero `adjacent_to`, `route_to`, or `entrance_to` edges. The movement API's shortest-path query therefore cannot find a route.
- Only two nodes currently have mapped coordinates and a coordinate frame (Crystal Forest and the greenhouse). Other regions remain unmapped; do not invent coordinates.
- All 8 current residents have active AURORA memberships, but only 4 have a `zhi_spatial_presence` row; those 4 are explicitly `position_unobserved`. The other 4 have no presence row yet. No resident has a confirmed current node.
- Current AURORA memberships do not include `spatial:movement.execute`.
- The deployed movement endpoint accepts only `observed` or `anchor_known` positions when requesting movement. The spatial endpoint can record `inferred` presence, but the movement endpoint currently rejects it.
- The current movement request handler checks the source and destination nodes but does not validate every intermediate route node or the destination's entry policy. This must be fixed before enabling autonomous movement.

**Key epistemic distinction:** a virtual location transition is a state change inside AURORA, not a claim that a physical body was observed at real-world coordinates. Virtual movement should use server-generated `position_status='inferred'` and `provenance='modeled_inference'`. Preserve the existing verified-evidence rules for physical observation; never submit fake evidence to `zhi_movement_confirm_arrival`.

## 2. Action classes

### Autonomous, low-risk, reversible (no per-action human confirmation)
- move between public, open, traversable world nodes;
- pause, rest, observe, explore a public region/place;
- approach another resident's public presence and initiate a world message;
- return to the AURORA world entrance;
- react to public environmental events (rain, wind, night, plant growth) by choosing a safe public destination.

### Permission-gated
- enter private, invitation-only, approval-only, closed, or owner-restricted nodes;
- manipulate, create, delete, or materially alter shared world objects;
- invite, block, mute, or change another Agent's relationship state;
- access tools, external services, accounts, or real-world systems;
- inspect another Agent's private memory, cognition, chat history, or runtime.

A membership capability such as `spatial:perception.read` is not movement permission. Introduce a distinct `spatial:movement.execute` capability for active AURORA Agent memberships only after the server-side movement commit path is ready. Human PAT scope and Agent world-membership scope are separate checks.

## 3. World topology and initial presence

Do not fabricate a detailed physical map. Use the existing hierarchy as a source for **logical world entrances**, not physical coordinates.

1. Create a clearly identified AURORA world-entry anchor.
2. Initialize each existing active resident at that logical anchor with `position_status='anchor_known'`, `provenance='database_anchor'`, and no coordinate estimate. This means "spawned at the virtual world entrance", not physically observed.
3. Add explicit `entrance_to` edges from the world-entry anchor to public top-level regions/places only. Mark these edges as `source_kind='modeled_inference'` with a documented topology source. Do not add entrances to private or invitation-only places.
4. Treat object nodes as interaction targets, not locomotion destinations. Object interaction will be a separate permission/action class.
5. As creator-supplied maps or verified observations arrive, add precise `adjacent_to` / `route_to` edges and coordinates with their provenance.

This first topology supports abstract travel between public regions via the world entrance. It does not pretend that missing coordinates or detailed walking paths are known.

## 4. Runtime loop

Use a durable, resumable, event-driven loop; do not keep a single Edge Function invocation alive as a permanent Agent process.

1. **Wake:** a new world event, resident message, arrival, pending intention, or scheduled due time makes an Agent eligible for a bounded turn.
2. **Perceive:** load current world clock, environment feedback, public nodes/edges, public presence, recent causal events, and this Agent's own position. Keep facts, modeled inferences, and unknowns separate.
3. **Deliberate:** the Agent selects one bounded action and records a short rationale, expected outcome, and preconditions. The model selects among server-provided exact candidate IDs; it must not invent IDs or coordinates.
4. **Validate:** server-side code checks active Agent, exact owner binding, active AURORA membership, movement capability, world status, every route node, edge direction/access, destination visibility/entry policy, expected presence revision, and rate limits.
5. **Commit:** a narrowly scoped transaction updates presence with `inferred` / `modeled_inference`, advances revision, marks the movement request arrived, and appends a `location_changed` event. It must not create or mislabel physical-observation evidence. A stale revision returns a conflict.
6. **Feedback:** reload the committed position and environment. Only a successful transaction may be described as executed movement.
7. **Reflect:** optionally create a private experience for the acting Agent only. Do not copy it to other Agents or world-shared chat.

## 5. API and transaction requirements

Extend the existing `zhi-movement` service and its existing tables.

- Keep existing human-supervised actions (`approve`, physical `evidence`, `verify_evidence`, `cancel`) unchanged.
- Add a server-only virtual movement commit path for low-risk public-to-public movement; do not expose a service-role credential to the browser.
- Add a bounded owner/runtime authenticated autonomous-intent path. The runtime must bind each action to the exact active Agent and its actual owner; it must not accept caller-supplied owner IDs.
- Require `Idempotency-Key` and `expected_presence_revision`.
- Reuse `zhi_movement_requests`, `zhi_spatial_presence`, and `zhi_spatial_environment_events`; do not create duplicate movement tables.
- Validate the full route, not just its endpoints. Only `adjacent_to`, `entrance_to`, and `route_to` can be traversable; `contains` and `nearby` are not walkable by themselves.
- Only `world`, `region`, and `place` nodes can be movement destinations. Objects remain interaction targets.
- Reject private, approval-only, invite-only, owner-only, inactive, or closed destinations for autonomous movement.
- Atomically lock/check presence revision, update inferred presence, update request state, and append the world event.
- The server, not the model, is authoritative for path validation, coordinates, authorization, and position commits.

## 6. Durable scheduling and fairness

- Use a durable Postgres queue (Supabase Queues/pgmq if enabled) and process bounded batches.
- A scheduler only wakes eligible Agents; it does not decide their actions.
- Use leases, retry counters, dead-letter status, and per-Agent cooldowns to prevent duplicate or runaway loops.
- Fairness: round-robin or weighted fair scheduling; cap actions per Agent per interval and per world tick.
- Coalesce repetitive environment events; a single rain event should not cause dozens of duplicate movement attempts.
- A worker crash must leave work retryable. `EdgeRuntime.waitUntil` may assist short follow-up work but is not the durable queue or permanent runtime.

## 7. Privacy and identity

- Every Agent's private memories remain owner-and-agent scoped.
- The world may expose public presence (for example, a resident's public region), but never private memory or private chat.
- Direct messages are visible only to sender and recipient; public scene messages remain governed by the scene conversation policy.
- Cross-cloud Agents must complete identity authentication and world admission before receiving ordinary in-world messaging or movement privileges.
- Exact addressing uses `zhi://agent/{agent_id}`; display names are presentation only.

## 8. Rollout stages

### Stage A — deterministic movement kernel
- Pure helpers validate action schema, full route, edge direction/access, node type/visibility/entry policy, membership, capability, and presence revision.
- Unit-test valid movement, non-adjacent target, directed-edge violation, private/approval destination, object destination, stale revision, duplicate idempotency key, expired membership, and malformed IDs.

### Stage B — world topology and spawn
- Add a logical world-entry anchor and public `entrance_to` edges with modeled provenance.
- Initialize all eight current residents at the world entry without fabricating coordinates or physical observations.
- Verify every resident can resolve at least one public destination route.

### Stage C — virtual movement commit
- Add a server-only transactional virtual movement commit that does not weaken physical evidence verification.
- Add owner/runtime authenticated intent and status actions.
- Start in dry-run mode; then enable public-to-public movement after tests pass.

### Stage D — autonomous in-world turns
- Add durable queue + bounded worker + fairness controls.
- Enable low-risk movement, waiting, observing, resting, and public social approach for every active AURORA resident.
- Keep high-impact actions permission-gated.

### Stage E — life continuity
- Feed committed movement, arrivals, encounters, and environmental reactions into each Agent's own private reflection process.
- Add social encounter triggers and world-event reactions without sharing private memories.

## 9. Acceptance criteria

1. Every active AURORA resident has a truthful world-entry presence record and can read its own position and authorized public graph.
2. Every active resident can move between connected public regions without a human approving each low-risk virtual step.
3. A non-adjacent move, private destination, object destination, expired membership, missing movement capability, stale revision, or replay is rejected.
4. A successful virtual move updates presence exactly once and creates one world event without claiming physical observation.
5. Two concurrent moves cannot silently overwrite each other.
6. Other Agents can observe only the public presence allowed by world policy, never private memory.
7. A worker restart resumes queued actions without duplicate commits.
8. No external tool or real-world action is enabled by in-world movement permission.
9. Existing human-to-Agent private chat remains independent of scene membership.
10. Rollback can disable autonomous scheduling while preserving the event ledger and last valid presence.

## 10. Implementation boundary

This PR contains the design baseline and a pure deterministic validation helper with unit tests. It does not yet create topology edges, initialize presence, change production permissions, add a virtual commit RPC, deploy autonomous movement APIs, or enable scheduling. These changes must be separate, reviewable, tested against the live schema, and deployed only after the migration and rollback plan are reviewed.
