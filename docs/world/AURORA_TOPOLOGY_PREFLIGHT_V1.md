# AURORA Logical Topology Preflight V1

**Status:** read-only validation helper; no production topology or resident position changes  
**Purpose:** prepare Stage B of `AURORA_AGENT_LOCOMOTION_V1.md` without inventing physical geography.

## Current evidence boundary

The current AURORA spatial graph contains a world node, region nodes, object nodes, and containment edges. A `contains` edge describes hierarchy only. It does not establish adjacency, a traversable path, an entrance, or a resident's current position.

The world model does not provide authoritative coordinates for every region. Missing coordinates must remain missing. This stage therefore treats a logical world-entry relationship as modeled navigation metadata, not a physical map or sensor observation.

## Preflight contract

`topology_helpers.ts` provides a pure function, `validateAuroraTopologyProposal`, for a proposed set of public logical entrances.

The caller must explicitly provide:
- the AURORA world ID and its existing world-root node ID;
- the region IDs deliberately selected for public entry;
- the candidate node and edge records.

For every selected region, preflight requires:
- the region exists in the same world and is active;
- the region is a `region` node, public, and open/inherited for entry;
- exactly one active undirected `entrance_to` edge runs from the world root to that region;
- the edge is open/inherited and marked `source_kind='modeled_inference'`.

The world root must itself be active, public, and open. A `contains` edge is never accepted as an entrance. Private, closed, approval-only, missing, foreign-world, or object nodes cannot be selected as public regions. An agent-observation provenance claim is not accepted as a modeled logical entrance.

## Deliberate non-actions

This helper:
- does not read or write Supabase;
- does not create an anchor or any edge;
- does not initialize resident presence;
- does not grant `spatial:movement.execute`;
- does not authorize private-scene entry;
- does not claim physical location, coordinates, or sensory observation;
- does not enable movement or autonomous scheduling.

## Next acceptance gate

Before any production topology migration:
1. inspect the live world-root and region IDs and entry policies;
2. have the creator explicitly approve which public regions are connected to the logical entrance;
3. run this preflight against the exact proposed records;
4. review an additive, idempotent migration and rollback/disable plan;
5. verify the migration in a disposable or otherwise already-available no-extra-cost test environment;
6. only then consider seeding logical presence for each active resident, clearly labeled `anchor_known` / `database_anchor` with null coordinates.

No new Supabase branch or paid resource is required or created by this PR.
