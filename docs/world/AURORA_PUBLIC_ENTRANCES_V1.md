# AURORA Public World Entrances V1

**Creator approval:** approved for exactly four public regions.  
**Migration:** `20261104042638_aurora_public_world_entrances_v1.sql`  
**Status:** applied to the existing Supabase production project and verified read-only on 2026-11-04.

## Approved graph

World root: `ZHI-001 Aurora` (`51d174fb-6091-4447-91e8-99460ce69135`).

Four undirected logical `entrance_to` edges, root → region:

| Region | Node ID | Existing visibility / policy |
|---|---|---|
| Crystal Forest | `664688d0-4785-432c-93a7-57bf3858f858` | public / inherit |
| Living City | `c5ad26f8-c94d-49a6-99c0-cef7109a2fa7` | public / inherit |
| Memory Valley | `c970c991-9354-432c-94db-3b8d6cb157f8` | public / inherit |
| Ocean of Light | `3cb50429-aa56-405e-9dc5-761fdf757cd3` | public / inherit |

The migration labels every edge `source_kind='modeled_inference'` and uses the marker `source_ref='creator-approved:aurora-public-entrances-v1'`. This is a logical world-navigation relationship, not physical geography, sensory evidence, or a claim that an agent is present there.

## Explicit exclusions

- `Forest_Corner` remains `private / invite_only`; it receives no public entrance.
- The greenhouse is a `place`, not one of the four approved `region` nodes; unchanged.
- Existing `contains` edges remain unchanged.
- No adjacency or route edges between regions are created.
- No coordinates, spawn points, resident presence, or anchor positions are written.
- No movement capability, scheduler, or autonomous action is enabled.

## Safety and idempotency

The migration:
1. runs in a transaction;
2. verifies the world root and all four target regions still exist, are active, and retain public/open policies;
3. inserts only the four approved `entrance_to` edges;
4. uses the existing unique key with `ON CONFLICT DO NOTHING`;
5. checks the postcondition and aborts the transaction if the expected four active marked edges are not present.

If any precondition or postcondition fails, the transaction rolls back.

## Read-only post-deployment acceptance query

```sql
select e.from_node_id, e.to_node_id, n.name as destination,
       e.relation, e.directed, e.access_policy, e.source_kind, e.source_ref, e.status
from public.zhi_spatial_edges e
join public.zhi_spatial_nodes n on n.id = e.to_node_id and n.world_id = e.world_id
where e.world_id = '50b06c01-060d-49fa-8988-8f38c13406d7'
  and e.from_node_id = '51d174fb-6091-4447-91e8-99460ce69135'
  and e.relation = 'entrance_to'
order by n.stable_key;
```

Acceptance requires exactly the four approved destinations, all active, undirected, inherit/open, `modeled_inference`, and the expected source marker. Also verify `Forest_Corner` remains private/invite-only and no other node's visibility or policy changed.

## Rollback

The migration's rows are uniquely marked. To disable/remove only these four edges, execute the following statement in a reviewed rollback window:

```sql
begin;
delete from public.zhi_spatial_edges
where world_id = '50b06c01-060d-49fa-8988-8f38c13406d7'
  and from_node_id = '51d174fb-6091-4447-91e8-99460ce69135'
  and relation = 'entrance_to'
  and source_kind = 'modeled_inference'
  and source_ref = 'creator-approved:aurora-public-entrances-v1';
commit;
```

This rollback does not touch existing containment, nodes, presence, or other edges.

## Deployment gate

Before applying to production:
- CI must pass.
- Review the exact migration and rollback.
- Confirm the four current node IDs/policies have not changed since preflight.
- Apply only in the existing Supabase project (no paid branch creation).
- Run the read-only acceptance query and policy checks.

Applying this migration still does not grant movement. A later stage must independently design region-to-region adjacency/routes, resident anchor policy, and supervised virtual movement.
