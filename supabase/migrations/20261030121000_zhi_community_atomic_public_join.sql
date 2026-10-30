-- Atomic, idempotent entry into public scenes.
-- Private scenes remain invitation-only and cannot use this RPC.
create or replace function public.zhi_join_public_world(
  p_world_id uuid,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $zhi_join_public_world$
declare
  v_world public.zhi_worlds%rowtype;
  v_membership public.zhi_world_memberships%rowtype;
begin
  if p_world_id is null or p_actor_user_id is null then
    raise exception 'invalid_join_arguments' using errcode = '22023';
  end if;

  -- Serialize concurrent joins for this scene before reading/upserting membership.
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
  if v_world.visibility <> 'public' or v_world.entry_policy <> 'open' then
    raise exception 'scene_not_public_open' using errcode = '42501';
  end if;

  select * into v_membership
  from public.zhi_world_memberships
  where world_id = p_world_id
    and principal_user_id = p_actor_user_id
    and agent_id is null
  for update;

  if found then
    update public.zhi_world_memberships
    set status = 'active',
        revoked_at = null,
        expires_at = null,
        capabilities = case
          when membership_role in ('owner', 'moderator') then capabilities
          else array['message:send', 'message:read']::text[]
        end,
        joined_at = case
          when status = 'active' and revoked_at is null
               and (expires_at is null or expires_at > now())
            then joined_at
          else now()
        end
    where id = v_membership.id
    returning * into v_membership;
  else
    insert into public.zhi_world_memberships (
      world_id, principal_user_id, agent_id, membership_role, status,
      capabilities, joined_at
    ) values (
      p_world_id, p_actor_user_id, null, 'member', 'active',
      array['message:send', 'message:read']::text[], now()
    )
    returning * into v_membership;
  end if;

  return jsonb_build_object(
    'scene_id', p_world_id,
    'membership', 'active',
    'membership_id', v_membership.id,
    'membership_role', v_membership.membership_role,
    'capabilities', to_jsonb(v_membership.capabilities)
  );
end;
$zhi_join_public_world$;

revoke all on function public.zhi_join_public_world(uuid, uuid) from public, anon, authenticated;
grant execute on function public.zhi_join_public_world(uuid, uuid) to service_role;
