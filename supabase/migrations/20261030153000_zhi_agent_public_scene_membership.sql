-- Independent agent membership in public ZHI scenes.
-- The creator remains the responsible principal; agent_id is the community actor.
begin;

create or replace function public.zhi_join_public_world_agent(
  p_world_id uuid,
  p_owner_user_id uuid,
  p_agent_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $zhi_join_public_world_agent$
declare
  v_world public.zhi_worlds%rowtype;
  v_agent public.zhi_agents%rowtype;
  v_membership public.zhi_world_memberships%rowtype;
begin
  if p_world_id is null or p_owner_user_id is null or p_agent_id is null then
    raise exception 'invalid_agent_join_arguments' using errcode = '22023';
  end if;

  select * into v_world from public.zhi_worlds
  where id = p_world_id for update;
  if not found then raise exception 'scene_not_found' using errcode = 'P0002'; end if;
  if v_world.status <> 'open' or v_world.visibility <> 'public'
     or v_world.entry_policy <> 'open' then
    raise exception 'scene_not_open_for_agent_join' using errcode = '22023';
  end if;

  select * into v_agent from public.zhi_agents
  where id = p_agent_id and owner_user_id = p_owner_user_id
  for update;
  if not found then raise exception 'agent_not_owned' using errcode = '42501'; end if;
  if v_agent.status <> 'active' then
    raise exception 'agent_not_active' using errcode = '22023';
  end if;

  select * into v_membership from public.zhi_world_memberships
  where world_id = p_world_id and principal_user_id = p_owner_user_id
    and agent_id = p_agent_id
  for update;

  if found then
    if v_membership.status = 'active' and v_membership.revoked_at is null
       and (v_membership.expires_at is null or v_membership.expires_at > now()) then
      return jsonb_build_object('scene_id', p_world_id, 'agent_id', p_agent_id,
        'membership', 'active', 'idempotent_replay', true);
    end if;
    update public.zhi_world_memberships
    set status = 'active', revoked_at = null, expires_at = null,
        membership_role = 'member',
        capabilities = array['message:read','message:send']::text[],
        joined_at = now()
    where id = v_membership.id;
  else
    insert into public.zhi_world_memberships (
      world_id, principal_user_id, agent_id, membership_role, status,
      capabilities, joined_at
    ) values (
      p_world_id, p_owner_user_id, p_agent_id, 'member', 'active',
      array['message:read','message:send']::text[], now()
    );
  end if;

  return jsonb_build_object('scene_id', p_world_id, 'agent_id', p_agent_id,
    'membership', 'active', 'idempotent_replay', false);
end;
$zhi_join_public_world_agent$;

create or replace function public.zhi_revoke_agent_world_membership(
  p_world_id uuid,
  p_owner_user_id uuid,
  p_agent_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $zhi_revoke_agent_world_membership$
declare
  v_membership public.zhi_world_memberships%rowtype;
begin
  if p_world_id is null or p_owner_user_id is null or p_agent_id is null then
    raise exception 'invalid_agent_revoke_arguments' using errcode = '22023';
  end if;

  if not exists (select 1 from public.zhi_agents a
    where a.id = p_agent_id and a.owner_user_id = p_owner_user_id) then
    raise exception 'agent_not_owned' using errcode = '42501';
  end if;

  select * into v_membership from public.zhi_world_memberships
  where world_id = p_world_id and principal_user_id = p_owner_user_id
    and agent_id = p_agent_id for update;
  if not found then raise exception 'agent_membership_not_found' using errcode = 'P0002'; end if;

  update public.zhi_world_memberships
  set status = 'revoked', revoked_at = coalesce(revoked_at, now())
  where id = v_membership.id;

  return jsonb_build_object('scene_id', p_world_id, 'agent_id', p_agent_id,
    'membership', 'revoked');
end;
$zhi_revoke_agent_world_membership$;

revoke all on function public.zhi_join_public_world_agent(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.zhi_revoke_agent_world_membership(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.zhi_join_public_world_agent(uuid, uuid, uuid) to service_role;
grant execute on function public.zhi_revoke_agent_world_membership(uuid, uuid, uuid) to service_role;

commit;
