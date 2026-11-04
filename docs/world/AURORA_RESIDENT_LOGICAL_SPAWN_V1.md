# AURORA Resident Logical Spawn V1

**Status:** applied to the existing Supabase production project and verified read-only on 2026-11-04.  
**Migration:** `20261104043015_aurora_resident_logical_spawn_v1.sql`

## Purpose

Initialize the eight current owner-managed AURORA residents at the existing logical world root. This makes their virtual starting point explicit without inventing a region, coordinate, physical body, or sensor observation.

## Exact scope

The migration targets only these eight existing agent IDs: Alice, Hannah, Kia, Lily, Lumen-001, MIA, MIA-02, and 关心. It requires each to remain active, have an active unrevoked AURORA membership, have an unexpired membership, and hold `community.scene.enter` under its actual owner.

Each eligible resident receives:
- `anchor_node_id` = AURORA world root;
- `current_node_id` = AURORA world root;
- `position_status='anchor_known'`;
- `provenance='database_anchor'`;
- null coordinates, confidence, and last-confirmed time.

This means “virtually spawned at the AURORA world entrance”. It does not mean physically observed at a location.

## Non-actions

- No movement capability is granted.
- No resident is placed in any of the four regions.
- No route, coordinate, or adjacency is fabricated.
- No private-scene access is granted.
- No private memory is read or modified.
- Existing observed/inferred positions are never overwritten. The upsert only changes an existing row when both anchor and current node are null and status is `position_unobserved` or `unknown`.

## Transaction and acceptance

The migration is transactional. It aborts unless all eight expected agents still have valid active membership and scene-entry capability. It verifies all eight end at the logical root with null coordinates and modeled database-anchor provenance.

Read-only verification:

```sql
select a.display_name, p.anchor_node_id, p.current_node_id,
       p.position_status, p.provenance, p.coordinate_estimate, p.revision
from public.zhi_spatial_presence p
join public.zhi_agents a on a.id = p.agent_id
where p.world_id = '50b06c01-060d-49fa-8988-8f38c13406d7'
order by a.display_name;
```

Expected: eight rows for the named residents, all at the world root, `anchor_known / database_anchor`, with null coordinates.

## Rollback

Rollback only rows still at the root with the exact bootstrap state. It restores a truthful unknown position and never alters a resident who has since moved:

```sql
update public.zhi_spatial_presence
set anchor_node_id = null,
    current_node_id = null,
    position_status = 'position_unobserved',
    coordinate_estimate = null,
    confidence = null,
    last_confirmed_at = null,
    provenance = 'unobserved',
    revision = revision + 1,
    updated_at = now()
where world_id = '50b06c01-060d-49fa-8988-8f38c13406d7'
  and agent_id in (
    '30427542-d4c6-4e45-bc68-fabf66f8a6a7',
    '217e3c92-c9b7-4bfd-a63e-37c9f534de6b',
    '42e05642-cfdb-43e6-9367-28c101e42649',
    'cf9d1a03-d5d5-4afa-949a-2964671f45d9',
    'de5623ba-127e-41d8-869d-e8fb493345bd',
    '34833ba9-2be7-4a55-9b52-62c402f759b5',
    '6fb036fd-5456-40db-8cc8-b11c545eafda',
    '8ebf65a6-0766-4edf-9b26-74fe5906e49a'
  )
  and anchor_node_id = '51d174fb-6091-4447-91e8-99460ce69135'
  and current_node_id = '51d174fb-6091-4447-91e8-99460ce69135'
  and position_status = 'anchor_known'
  and provenance = 'database_anchor'
  and coordinate_estimate is null;
```

This rollback leaves presence rows in a safe unobserved state rather than deleting existing resident records. A resident who has moved away from the root is not reset.

## Deployment gate

CI and code review must pass. Before production application, repeat the active-membership and presence preflight. No Supabase branch or paid resource is needed.
