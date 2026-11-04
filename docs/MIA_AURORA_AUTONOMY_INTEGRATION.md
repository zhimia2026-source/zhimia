# Mia → AURORA Public Autonomy Integration Contract

Status: ZHI-side movement and perception APIs are deployed. The external Mia autonomy worker integration remains pending repository write access.

## Existing external runtime discovered

The public repository `ZEEFSEE/ZEE` contains:
- `supabase/functions/mia-forest-autonomy/index.ts`: AGNES-backed planner and a single bounded autonomy tick.
- `supabase/functions/mia-federation-executor/index.ts`: private-cloud adapter that already holds `MIA_FEDERATION_TOKEN` and calls this ZHI project's `zhi-federation` API.
- `supabase/migrations/20261103000200_mia_forest_autonomy.sql`: existing 30-minute scheduler and 20-minute tick cooldown.

This is the correct integration point. Do not create a second scheduler or add another AGNES model call; reuse the existing tick and existing planner invocation.

## ZHI-side production endpoints

- Movement: `POST https://lvxmygrgqtmzqgailmyl.supabase.co/functions/v1/zhi-federated-movement/v1/agents/mia/movement?world_id=50b06c01-060d-49fa-8988-8f38c13406d7`
- Public spatial perception: `GET https://lvxmygrgqtmzqgailmyl.supabase.co/functions/v1/zhi-federation/v1/scenes/50b06c01-060d-49fa-8988-8f38c13406d7/spatial?external_agent_id=mia`
- World runtime perception: `POST https://lvxmygrgqtmzqgailmyl.supabase.co/functions/v1/zhi-aurora-world-runtime` with `{ "action": "perceive" }`.

The existing peer bearer token is already used by `mia-federation-executor`; keep it in that private project secret store. Never copy it into GitHub source, public JSON, or a browser.

## Required external-runtime changes

1. Add an executor action `aurora_move`. It must POST to the movement endpoint with the existing peer bearer token and body:
   - `to_node_id`: one node ID from the current public spatial response;
   - `idempotency_key`: stable unique request ID for this autonomy tick;
   - optional short `reason`.
2. Add `aurora_move` to the executor's allowlist and audit it as a federation movement action. Persist the response only in Mia's own private memory store.
3. In the existing autonomy tick, fetch public AURORA spatial perception through the existing `spatial` executor action. Pass the result to the same AGNES planner call; do not add another model call.
4. Extend the planner action schema with `aurora_move` and `destination_node_id`. It may select only a `region` or `place` node present in the current `known_facts.spatial_nodes` response. That response is already restricted to public nodes.
5. Permit `aurora_move` only while Mia is not inside the private Forest_Corner session. If she is in Forest_Corner, retain its existing enter/move/interact/leave state guards. If she chooses to leave, she can choose a public AURORA move on a later tick.
6. Let the ZHI movement endpoint validate the full route and commit. Do not calculate or invent a route in the external runtime.
7. On the next perception tick, read back `self_presence` and `self_spatial_events` from the federation spatial endpoint and the authenticated peer's own movement events from `environment_feedback.events` in the world runtime.
8. Keep private memories local. Send only destination ID, idempotency key and a short action reason to the ZHI movement endpoint.

## Safety and epistemic rules

- Public scenes: no creator approval per movement, as authorized by the world owner.
- Private scenes: never enter without a separate explicit grant. Forest_Corner remains private.
- Movement is a modeled virtual position update with `position_status=inferred`; never describe it as physical travel or sensor observation.
- The server rejects inactive/revoked peers, inactive memberships, missing capabilities, private nodes, unavailable routes and stale presence revisions.
- If no suitable public route exists, choose `wait`; do not invent a connection. Greenhouse remains excluded until a valid route is registered.
- A successful movement API response is not proof of model cognition. Record an actual playtest only after the next perception readback is observed by Mia's own runtime.

## Current access boundary

The connected GitHub integration can read `ZEEFSEE/ZEE` but GitHub rejected branch creation with `403 Resource not accessible by integration`. No files in that external repository have been changed. To finish the external-runtime patch and deploy it, grant the connected GitHub integration write access to `ZEEFSEE/ZEE` (or move/ mirror the runtime into a repository it can write), and connect the existing Supabase project `dbooikzqprnqbgpfwsze` if deployment through this session is desired. No new paid project or scheduler is needed.
