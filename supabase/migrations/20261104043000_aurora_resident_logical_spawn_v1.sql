-- Initialize the eight currently approved owner-managed AURORA residents at the logical world entrance.
-- This is a virtual database anchor, not physical observation. No coordinates or movement capability are granted.

begin;

do $$
declare
  v_world uuid := '50b06c01-060d-49fa-8988-8f38c13406d7';
  v_root uuid := '51d174fb-6091-4447-91e8-99460ce69135';
  v_eligible integer;
begin
  if not exists (
    select 1 from public.zhi_spatial_nodes
    where id = v_root and world_id = v_world and node_type = 'world'
      and status = 'active' and visibility = 'public' and entry_policy = 'open'
  ) then
    raise exception 'AURORA logical spawn: active public open world root required';
  end if;

  with expected(agent_id) as (
    values
      ('30427542-d4c6-4e45-bc68-fabf66f8a6a7'::uuid), -- Alice
      ('217e3c92-c9b7-4bfd-a63e-37c9f534de6b'::uuid), -- Hannah
      ('42e05642-cfdb-43e6-9367-28c101e42649'::uuid), -- Kia
      ('cf9d1a03-d5d5-4afa-949a-2964671f45d9'::uuid), -- Lily
      ('de5623ba-127e-41d8-869d-e8fb493345bd'::uuid), -- Lumen-001
      ('34833ba9-2be7-4a55-9b52-62c402f759b5'::uuid), -- MIA
      ('6fb036fd-5456-40db-8cc8-b11c545eafda'::uuid), -- MIA-02
      ('8ebf65a6-0766-4edf-9b26-74fe5906e49a'::uuid)  -- 关心
  )
  select count(*) into v_eligible
  from expected x
  join public.zhi_agents a on a.id = x.agent_id and a.status = 'active'
  join public.zhi_world_memberships m
    on m.agent_id = a.id
   and m.world_id = v_world
   and m.principal_user_id = a.owner_user_id
   and m.status = 'active'
   and m.revoked_at is null
   and (m.expires_at is null or m.expires_at > now())
   and m.capabilities @> array['community.scene.enter']::text[];

  if v_eligible <> 8 then
    raise exception 'AURORA logical spawn: expected all eight approved active residents with scene-entry capability; found %', v_eligible;
  end if;
end $$;

with expected(agent_id) as (
  values
    ('30427542-d4c6-4e45-bc68-fabf66f8a6a7'::uuid),
    ('217e3c92-c9b7-4bfd-a63e-37c9f534de6b'::uuid),
    ('42e05642-cfdb-43e6-9367-28c101e42649'::uuid),
    ('cf9d1a03-d5d5-4afa-949a-2964671f45d9'::uuid),
    ('de5623ba-127e-41d8-869d-e8fb493345bd'::uuid),
    ('34833ba9-2be7-4a55-9b52-62c402f759b5'::uuid),
    ('6fb036fd-5456-40db-8cc8-b11c545eafda'::uuid),
    ('8ebf65a6-0766-4edf-9b26-74fe5906e49a'::uuid)
)
insert into public.zhi_spatial_presence
  (agent_id, owner_user_id, world_id, anchor_node_id, current_node_id,
   position_status, coordinate_estimate, confidence, last_confirmed_at,
   provenance, revision, updated_at)
select a.id, a.owner_user_id, '50b06c01-060d-49fa-8988-8f38c13406d7',
       '51d174fb-6091-4447-91e8-99460ce69135',
       '51d174fb-6091-4447-91e8-99460ce69135',
       'anchor_known', null, null, null, 'database_anchor', 1, now()
from expected x
join public.zhi_agents a on a.id = x.agent_id and a.status = 'active'
join public.zhi_world_memberships m
  on m.agent_id = a.id
 and m.world_id = '50b06c01-060d-49fa-8988-8f38c13406d7'
 and m.principal_user_id = a.owner_user_id
 and m.status = 'active'
 and m.revoked_at is null
 and (m.expires_at is null or m.expires_at > now())
 and m.capabilities @> array['community.scene.enter']::text[]
on conflict (agent_id, world_id) do update set
  anchor_node_id = excluded.anchor_node_id,
  current_node_id = excluded.current_node_id,
  position_status = 'anchor_known',
  coordinate_estimate = null,
  confidence = null,
  provenance = 'database_anchor',
  revision = public.zhi_spatial_presence.revision + 1,
  updated_at = now()
where public.zhi_spatial_presence.current_node_id is null
  and public.zhi_spatial_presence.anchor_node_id is null
  and public.zhi_spatial_presence.position_status in ('position_unobserved','unknown');

do $$
declare
  v_spawned integer;
begin
  select count(*) into v_spawned
  from public.zhi_spatial_presence
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

  if v_spawned <> 8 then
    raise exception 'AURORA logical spawn: expected eight residents anchored at the world root; found %', v_spawned;
  end if;
end $$;

commit;
