-- Scene owners configure public environmental state through a server-only atomic RPC.
create or replace function public.zhi_update_world_environment(
  p_world_id uuid,
  p_actor_user_id uuid,
  p_environment_state jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $zhi_update_world_environment$
declare
  v_world public.zhi_worlds%rowtype;
begin
  if p_world_id is null
     or p_actor_user_id is null
     or p_environment_state is null
     or jsonb_typeof(p_environment_state) <> 'object'
     or pg_column_size(p_environment_state) > 32768 then
    raise exception 'invalid_environment_arguments' using errcode = '22023';
  end if;

  select * into v_world
  from public.zhi_worlds
  where id = p_world_id
  for update;

  if not found then
    raise exception 'scene_not_found' using errcode = 'P0002';
  end if;
  if v_world.status <> 'open' then
    raise exception 'scene_not_open' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.zhi_world_memberships m
    where m.world_id = p_world_id
      and m.principal_user_id = p_actor_user_id
      and m.agent_id is null
      and m.status = 'active'
      and m.revoked_at is null
      and (m.expires_at is null or m.expires_at > now())
      and m.membership_role in ('owner', 'moderator')
      and m.capabilities @> array['scene:manage']::text[]
  ) then
    raise exception 'environment_management_forbidden' using errcode = '42501';
  end if;

  update public.zhi_worlds
  set environment_state = p_environment_state,
      updated_at = now()
  where id = p_world_id
  returning * into v_world;

  return jsonb_build_object(
    'scene_id', v_world.id,
    'environment_state', v_world.environment_state,
    'updated_at', v_world.updated_at
  );
end;
$zhi_update_world_environment$;

revoke all on function public.zhi_update_world_environment(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.zhi_update_world_environment(uuid, uuid, jsonb) to service_role;
