-- Give every current AURORA resident a logical entrance anchor if they do not yet have one.
-- This is a database world anchor, not physical observation or a claim of witnessed arrival.
-- Existing positions and histories are never overwritten.

do $$
declare
  v_world uuid := '50b06c01-060d-49fa-8988-8f38c13406d7';
  v_root uuid := '51d174fb-6091-4447-91e8-99460ce69135';
  v_residents integer;
  v_eligible integer;
begin
  if not exists (
    select 1 from public.zhi_spatial_nodes
    where id = v_root and world_id = v_world and node_type = 'world'
      and status = 'active' and visibility = 'public' and entry_policy = 'open'
  ) then
    raise exception 'AURORA spatial bootstrap requires an active public open world root';
  end if;

  select count(*) into v_residents
  from public.zhi_agents
  where role = 'world_resident' and status = 'active';

  select count(distinct a.id) into v_eligible
  from public.zhi_agents a
  join public.zhi_world_memberships m
    on m.agent_id = a.id
   and m.principal_user_id = a.owner_user_id
   and m.world_id = v_world
   and m.status = 'active'
   and m.revoked_at is null
   and (m.expires_at is null or m.expires_at > now())
   and m.capabilities @> array['community.scene.enter','spatial:movement.execute']::text[]
  where a.role = 'world_resident' and a.status = 'active';

  if v_residents = 0 or v_eligible <> v_residents then
    raise exception 'AURORA spatial bootstrap expected active membership and movement capability for every resident; residents %, eligible %',
      v_residents, v_eligible;
  end if;
end $$;

insert into public.zhi_spatial_presence (
  agent_id, owner_user_id, world_id, anchor_node_id, current_node_id,
  position_status, coordinate_estimate, confidence, last_confirmed_at,
  provenance, revision, updated_at
)
select
  a.id, a.owner_user_id, '50b06c01-060d-49fa-8988-8f38c13406d7'::uuid,
  '51d174fb-6091-4447-91e8-99460ce69135'::uuid,
  '51d174fb-6091-4447-91e8-99460ce69135'::uuid,
  'anchor_known', null, null, null, 'database_anchor', 1, now()
from public.zhi_agents a
join public.zhi_world_memberships m
  on m.agent_id = a.id
 and m.principal_user_id = a.owner_user_id
 and m.world_id = '50b06c01-060d-49fa-8988-8f38c13406d7'::uuid
 and m.status = 'active'
 and m.revoked_at is null
 and (m.expires_at is null or m.expires_at > now())
 and m.capabilities @> array['community.scene.enter','spatial:movement.execute']::text[]
where a.role = 'world_resident' and a.status = 'active'
on conflict (agent_id, world_id) do nothing;

do $$
begin
  if exists (
    select 1
    from public.zhi_agents a
    left join public.zhi_spatial_presence p
      on p.agent_id = a.id
     and p.owner_user_id = a.owner_user_id
     and p.world_id = '50b06c01-060d-49fa-8988-8f38c13406d7'::uuid
    where a.role = 'world_resident' and a.status = 'active'
      and (p.current_node_id is null or p.position_status not in ('anchor_known','observed','inferred'))
  ) then
    raise exception 'AURORA spatial bootstrap did not establish a valid logical position for every active resident';
  end if;
end $$;
