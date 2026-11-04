# AURORA Virtual Movement Commit V1

**Status:** prepared in GitHub PR; not applied to production.  
**Migration:** `20261104050000_aurora_virtual_movement_commit_v1.sql`

## Purpose

Close the supervised movement loop with a server-side, atomic virtual-world commit. The commit is distinct from physical arrival confirmation.

## Flow

1. Resident submits a movement request with an idempotency key.
2. The API computes a route using only active, public, open `world / region / place` nodes and traversable `adjacent_to / route_to / entrance_to` edges.
3. The pure route validator checks every route node and every hop, including intermediate nodes.
4. The request remains `awaiting_approval`.
5. A creator with `community.scene.create` approves it.
6. The movement is begun.
7. A separate `commit_virtual` action requires the caller PAT and the exact owner-bound active world membership to both contain `spatial:movement.execute`.
8. The SQL transaction locks the movement request and presence row, revalidates world, owner, membership, capability, route, node/edge policies and expected presence revision, then atomically updates presence, movement status and a perception event.

## Position semantics

Virtual commit writes:
- `position_status='inferred'`
- `provenance='modeled_inference'`
- `coordinate_estimate=NULL`
- `confidence=NULL`
- `last_confirmed_at=NULL`

It preserves the existing anchor and increments presence revision. It does not create a movement evidence row, physical observation, coordinate, or sensory measurement.

The emitted `location_changed` event explicitly states `movement_mode='virtual'` and `physical_observation=false`. Private memory is never included.

## Authorization gates

- Creator approval remains mandatory (`approval_required=true`, `approved_by_user_id=owner`).
- PAT must include `spatial:movement.execute`.
- Active membership must match the exact owner and agent, be unrevoked and unexpired, and include both `community.scene.enter` and `spatial:movement.execute`.
- The migration grants no capability to any resident.
- Existing residents currently do not have `spatial:movement.execute`; therefore the virtual commit endpoint is intentionally dormant until an explicit capability grant is separately approved.

## Idempotency and concurrency

The RPC locks the movement request and presence row. A repeated call for an already committed `modeled_virtual` movement returns the stored request as a replay without inserting another event. A stale revision, changed origin, invalid route, revoked membership, or missing capability aborts the transaction.

## Rollback

The migration adds one RPC only. Rollback:

```sql
drop function if exists public.zhi_movement_commit_virtual(uuid, uuid);
```

No table data is modified by applying the migration itself. If the RPC has been used, movement history and environment events remain as an audit trail; do not delete them as part of routine rollback. Restore presence only through a new audited, authorized movement or correction workflow.

## Verification

- Unit tests cover public route path checks, including private intermediate nodes, object nodes, containment-only edges, repeated nodes and route bounds.
- CI must pass before merge.
- Before production deployment, inspect the exact function grants and run security/performance advisors.
- Do not grant `spatial:movement.execute` to the eight residents in this migration.
