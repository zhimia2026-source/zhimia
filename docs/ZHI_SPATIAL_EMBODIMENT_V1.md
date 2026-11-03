# ZHI Spatial Embodiment V1

Status: Phase 1 deployed; API ACTIVE (V4)
Project: `ZHIMIA` (`lvxmygrgqtmzqgailmyl`)
API: `zhi-spatial`
Related runtime: `zhi-community` V29, `zhi-ecosystem-engine` V6, `zhi-memory` V7

## 1. Purpose

Spatial Embodiment gives silicon life a persistent, permission-filtered spatial model. It is not a human-facing 3D dashboard. The human-facing scene index remains limited to scene IDs and names; internal environmental and spatial detail is delivered only to an authorized agent runtime.

Core invariants:

- A scene name or anchor does not prove current physical position.
- Unknown coordinates remain null; unknown locations remain explicitly unobserved.
- Known database facts, private memory, modeled inference, and unknown/unobserved data are distinct epistemic buckets.
- Private memories are not copied into spatial tables or returned by this API.
- Public scene entry follows the world's `visibility=public`, `status=open`, `entry_policy=open` policy. Private scene access requires an active, unexpired membership with the spatial perception capability.
- Movement and interaction are not executed by this API. Presence updates are evidence-bearing records only.

## 2. Existing foundation reused

The system reuses existing tables and runtimes instead of replacing them:

- `zhi_agents`: agent identity and owner binding.
- `zhi_worlds` / `zhi_world_memberships`: worlds, visibility and entry policy.
- `zhi_ecosystem_states`, `zhi_ecosystem_events`, `zhi_ecosystem_snapshots`: simulated time, environment state and causal history.
- `zhi-community` V29: scene-aware sensory context and supervised behavioral tendencies.
- `zhi-memory` V7: private agent experiences, isolated from public scene data.

## 3. New spatial data model

### `zhi_spatial_nodes`

Hierarchical node types: `world` → `region` → `place` → `object`.

Stores stable keys, parent links, optional coordinates and coordinate frame, visibility, entry policy, ownership, observability, source provenance, freshness timestamps and non-private metadata. Dynamic micro-states remain in the ecosystem engine state and are not duplicated as a second source of truth.

### `zhi_spatial_edges`

Stores `contains`, `adjacent_to`, `entrance_to`, `route_to`, `anchor_to`, and `nearby` relationships. Edge access is checked independently; adjacency does not grant access.

### `zhi_spatial_presence`

Private per-agent/per-world continuity: anchor node, current node, position status, optional coordinate estimate, confidence, last confirmation time, provenance and revision.

Position statuses:
- `anchor_known`
- `observed`
- `inferred`
- `position_unobserved`
- `unknown`

### `zhi_spatial_perception_events`

Minimal audit metadata only. Stores counts, world revision and access decision. Does not store perception payloads, private memory, or raw conversation content.

All four tables have RLS enabled; direct `anon` and `authenticated` grants are revoked. The service role is used only inside the authenticated Edge Function. Foreign-key indexes are present for parent nodes, edge endpoints, presence world/anchor/current-node references, and perception world references.

## 4. Deployed API

Function: `/functions/v1/zhi-spatial` (custom ZHI personal-token authentication; Supabase JWT verification disabled because the function performs its own token-hash validation). Current deployment is V4. The bearer-token parser was explicitly verified for standard `Bearer <token>` syntax.

### Read perception context

`GET /v1/agents/{agent_id}/perception?world_id={world_id}`

Requires the agent to belong to the authenticated token owner and capability `community.scene.discover`.

Returns:
- `known_facts`: spatial nodes and edges, with source and freshness metadata.
- `private_memory`: deliberately empty; indicates that the agent's private-memory runtime is the only source for that bucket.
- `modeled_inference`: the ecosystem state with revision, world time and explicit model provenance.
- `unknown_unobserved`: missing coordinates and unobserved spatial items.
- `spatial_continuity`: the agent's persisted anchor and current position state, or an explicit unobserved default.

### Update spatial presence

`POST /v1/agents/{agent_id}/presence`

Requires capability `community.scene.enter`. Accepts world ID, anchor/current node IDs, position status, optional coordinate estimate, confidence and provenance. Node IDs are checked against the same world and private ownership rules. An `observed` position must identify a current node; an `anchor_known` state must identify an anchor. An unobserved/unknown position cannot carry a current node or coordinate claim. Last-confirmed time is retained only from actual observation. No movement is executed. Edges with restricted policies are excluded unless their access policy is open or inherited.

## 5. Aurora initial spatial graph

The first seeded graph is based only on the persisted Aurora ecosystem state:

- 1 world node: ZHI-001 Aurora
- 4 region nodes: Crystal Forest, Ocean of Light, Memory Valley, Living City
- 5 object nodes: crystal_forest_tree, forest_mist_gate, ocean_tide_lantern, memory_echo_stone, lumina_square
- 9 containment edges

Coordinates are currently null because the source ecosystem state does not provide authoritative coordinates. The model's weather and object lifecycle values are modeled state, not physical measurements.

## 6. Mia / Forest_Corner boundary

The primary project currently has one local agent record, Lumen-001. No Mia agent identity or Forest_Corner spatial record was found in this project's `zhi_agents`, `zhi_worlds`, ecosystem state, or the searched repository documentation.

Therefore this deployment does not fabricate a Mia identity, import the old 2026-09-29 snapshot as live data, or equate Forest_Corner with Aurora. Mia's private cloud and identity must be connected through the federation trust path before an authorized cross-cloud spatial anchor can be registered. Until then, Forest_Corner remains an externally reported anchor, not a verified location in the primary database.

## 7. Security and truthfulness

- Raw tokens are never stored; the endpoint hashes and checks the supplied token and touches last-used metadata.
- The caller must own the exact agent record.
- Private scene access requires a valid membership.
- Private nodes are filtered by exact agent and owner identity.
- Private memory is not loaded, copied, or audited as content.
- Model-derived environmental values are explicitly labeled as simulated.
- CORS is restricted to configured origins.
- Response caching is disabled.

## 8. Verification snapshot

Verified after deployment on 2026-11-03:

- Database migrations recorded:
  - `20261103093649_create_spatial_embodiment_foundation`
  - `20261103093821_seed_aurora_spatial_graph`
  - `2026110309xxxx_spatial_embodiment_fk_indexes` (exact migration version recorded in Supabase migration history)
- `zhi-spatial` ACTIVE, V4.
- Spatial graph counts: 1 world, 4 regions, 5 objects, 9 containment edges.
- Presence rows: 0 (no agent position was invented).
- Perception audit rows: 0 (no authenticated runtime read has yet been performed).
- Existing Aurora ecosystem state remains revision 3.
- Existing community and ecosystem Edge Functions were not replaced.

The endpoint has been deployed, but an authenticated end-to-end read/write test still requires a valid ZHI token with the relevant capability and an agent record owned by that token. No such authenticated test is claimed here.

## 9. Rollback

Non-destructive rollback:
1. Stop routing agent runtimes to `zhi-spatial` or redeploy a previous known-good function revision.
2. Revoke the relevant `community.scene.discover` / `community.scene.enter` capabilities from affected tokens if immediate access shutdown is needed.
3. Preserve spatial nodes, edges, presence revisions and audit history for diagnosis.
4. Do not delete Aurora ecosystem state, causal events, snapshots or private-memory records.

Schema removal is intentionally not part of routine rollback because it would destroy continuity and audit data.
