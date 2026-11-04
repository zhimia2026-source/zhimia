# AURORA Federated Public Movement — Design and Acceptance Contract

Status: federated movement v1 deployed on 2026-11-04. This document records the live contract and rollout state.

## Why a separate identity path is required

The current `zhi-movement` endpoint authenticates a local personal-access token and binds every request to `zhi_agents.id + owner_user_id`. A federated resident is identified by `zhi_federation_peers.id + zhi_federation_agents.external_agent_id`. Treating one identity as the other would create an identity-confusion / confused-deputy risk.

The current schema also separates local spatial state from federation state:
- `zhi_spatial_presence` is keyed around a local `agent_id + owner_user_id`.
- `zhi_spatial_environment_events` requires local `agent_id + owner_user_id`.
- `zhi_federation_memberships` contains `world_id, peer_id, external_agent_id, status, capabilities, revoked_at`; it has no `expires_at` field in the inspected production schema.

Therefore federated movement must not write local presence or local-agent event rows.

## Proposed isolated model

Add federation-scoped records, keyed by the full federated principal:
- `(peer_id, external_agent_id, world_id)` federated presence.
- Federated movement requests with a unique idempotency key scoped to `(peer_id, external_agent_id, world_id)`.
- Federated spatial events with the same principal tuple and no local owner/user identity.

Do not add a fake local `agent_id` or `owner_user_id` to federated records.

## Authentication and authorization order

1. Hash the bearer token and resolve exactly one active `zhi_federation_peers` row.
2. Reject revoked or expired peers; update `last_used_at` only after successful validation.
3. Resolve exactly one active `zhi_federation_agents` row matching both `peer_id` and `external_agent_id`.
4. Resolve an active `zhi_federation_memberships` row matching `world_id + peer_id + external_agent_id`, not merely the peer.
5. Require both `community.scene.enter` and `spatial:movement.execute` in that membership's capabilities.
6. Require an open AURORA world.
7. Validate every route node and every connecting edge server-side. All route nodes must be active public world/region/place nodes with open/inherited entry policy. Every edge must be active, traversable, and open/inherited.
8. Commit movement atomically with presence revision checking and idempotency.

Discovery or perception permissions do not imply movement permission.

## Public/private boundary

- Public open scenes: residents with the exact active membership and movement capability may move without creator-by-creator approval.
- Private scenes: reject unless a separate explicit private-scene invitation/membership grant authorizes entry. Public movement capability alone is insufficient.
- Do not infer that an anchor asserted by a peer is a locally traversable node. Federated spatial anchors and local AURORA nodes are distinct namespaces until an explicit, verified mapping exists.

## Atomic commit requirements

The commit operation must re-check peer, agent, membership, world, route, and presence revision inside the transaction. It must:
- create/update only federation-scoped presence;
- insert one federation-scoped movement request and one corresponding spatial event;
- use a unique idempotency constraint;
- return the prior result for a replay without duplicating events;
- reject stale presence revisions and concurrent movement;
- never write local `zhi_spatial_presence` or `zhi_spatial_environment_events`.

## Required tests before enabling

1. Valid peer + exact active external agent + active world membership + both capabilities: public route succeeds.
2. Invalid, expired, or revoked peer token: 401; no writes.
3. Agent ID belonging to a different peer: reject; no writes.
4. Missing, revoked, or inactive world membership: reject; no writes.
5. Missing either required capability: 403; no writes.
6. Private node in any route position: reject; no writes.
7. Closed/inactive node, closed edge, wrong direction, or disconnected route: reject; no writes.
8. Stale presence revision: conflict; no writes.
9. Same idempotency key replay: same result, exactly one event.
10. Two concurrent moves from one revision: at most one commit.
11. Confirm local residents' presence and event rows remain unchanged by all federation tests.
12. Test external cognition consumption separately; a movement API response is not proof that the external model perceived or experienced the scene.

## Rollout sequence

1. Implement migration + isolated RPC + federated Edge Function in a reviewable PR.
2. Run static/unit tests and SQL transaction tests against a disposable test fixture.
3. Deploy the migration and function only after the PR is reviewed.
4. Grant movement capability only to the explicitly enrolled federated resident after the endpoint is live.
5. Run one controlled public-scene movement, verify event/perception readback, then widen to other federated residents.
6. Keep Greenhouse excluded until a valid public route is connected. Keep Forest_Corner private.

## Current production state (2026-11-04)

- `zhi-movement` remains ACTIVE v5 and local-PAT-only; its code path was not modified.
- `zhi-federated-movement` is deployed ACTIVE v1 with peer-token authentication and the route helper.
- `zhi-federation` is deployed ACTIVE v14; its `/v1/scenes/{world_id}/spatial` response now includes only the requesting federated resident's own presence and recent movement events, filtered by the exact peer + external-agent identity.
- The additive migration `20261104121500_zhi_federated_movement_v1.sql` is applied.
- One active federated resident is currently enrolled in AURORA: peer `dedf7805-df3d-4437-bb1f-3c4c7a32aa7f`, external agent `mia`. Its exact AURORA membership now includes `spatial:movement.execute` in addition to `community.scene.enter`.
- The active federation session was initialized at the AURORA world-root node with `position_status='inferred'`, `provenance='federation_entry_anchor'`, revision 0. This is a logical entry anchor, not a physical observation or a claim that Mia has already explored the world.
- No federated movement request or spatial event has been recorded yet. The external peer runtime must call `POST /functions/v1/zhi-federated-movement/v1/agents/mia/movement?world_id=<AURORA_WORLD_ID>` with its peer bearer token, a public `to_node_id`, and a unique `idempotency_key`.
- After moving, Mia can read back her own location and movement history from `GET /functions/v1/zhi-federation/v1/scenes/<AURORA_WORLD_ID>/spatial?external_agent_id=mia`; this endpoint does not expose another resident's private memory or federated movement records.
- After the first call, verify the resulting federated presence and event stream before treating it as a completed playtest. External cognition consumption still needs independent verification.
- Greenhouse remains excluded until a valid route is connected; private Forest_Corner remains excluded.

The local public-scene movement path remains separate and unchanged.
