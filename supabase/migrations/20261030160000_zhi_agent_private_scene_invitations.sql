-- Target-agent private scene invitations, bound to one exact agent identity.
begin;

create or replace function public.zhi_issue_world_agent_invitation(
  p_world_id uuid,
  p_creator_user_id uuid,
  p_target_agent_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $zhi_issue_world_agent_invitation$
declare
  v_world public.zhi_worlds%rowtype;
  v_agent public.zhi_agents%rowtype;
  v_invitation public.zhi_world_invitations%rowtype;
begin
  if p_world_id is null or p_creator_user_id is null or p_target_agent_id is null
     or p_token_hash is null or char_length(p_token_hash) <> 64
     or p_expires_at is null or p_expires_at <= now()
     or p_expires_at > now() + interval '7 days' then
    raise exception 'invalid_agent_invitation_arguments' using errcode = '22023';
  end if;

  select * into v_world from public.zhi_worlds
  where id = p_world_id for share;
  if not found then raise exception 'scene_not_found' using errcode = 'P0002'; end if;
  if v_world.status <> 'open' or v_world.visibility <> 'private'
     or v_world.entry_policy <> 'invite_only' then
    raise exception 'scene_not_invitable' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.zhi_world_memberships m
    where m.world_id = p_world_id
      and m.principal_user_id = p_creator_user_id
      and m.agent_id is null
      and m.status = 'active'
      and m.revoked_at is null
      and (m.expires_at is null or m.expires_at > now())
      and m.membership_role in ('owner', 'moderator')
      and m.capabilities @> array['scene:manage']::text[]
  ) then
    raise exception 'agent_invitation_forbidden' using errcode = '42501';
  end if;

  select * into v_agent from public.zhi_agents
  where id = p_target_agent_id and status = 'active'
  for share;
  if not found then raise exception 'target_agent_not_found_or_inactive' using errcode = 'P0002'; end if;

  insert into public.zhi_world_invitations (
    world_id, created_by_user_id, target_user_id, target_agent_id,
    token_hash, expires_at
  ) values (
    p_world_id, p_creator_user_id, null, p_target_agent_id,
    p_token_hash, p_expires_at
  ) returning * into v_invitation;

  return jsonb_build_object(
    'invitation_id', v_invitation.id,
    'scene_id', v_invitation.world_id,
    'target_agent_id', v_invitation.target_agent_id,
    'expires_at', v_invitation.expires_at
  );
end;
$zhi_issue_world_agent_invitation$;

create or replace function public.zhi_redeem_world_agent_invitation(
  p_token_hash text,
  p_actor_user_id uuid,
  p_agent_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $zhi_redeem_world_agent_invitation$
declare
  v_invitation public.zhi_world_invitations%rowtype;
  v_world public.zhi_worlds%rowtype;
  v_agent public.zhi_agents%rowtype;
  v_membership public.zhi_world_memberships%rowtype;
begin
  if p_token_hash is null or char_length(p_token_hash) <> 64
     or p_actor_user_id is null or p_agent_id is null then
    raise exception 'invalid_agent_invitation_arguments' using errcode = '22023';
  end if;

  select * into v_invitation from public.zhi_world_invitations
  where token_hash = p_token_hash for update;
  if not found then raise exception 'invitation_invalid' using errcode = 'P0002'; end if;
  if v_invitation.used_at is not null or v_invitation.revoked_at is not null
     or (v_invitation.expires_at is not null and v_invitation.expires_at <= now()) then
    raise exception 'invitation_unavailable' using errcode = '22023';
  end if;
  if v_invitation.target_agent_id is distinct from p_agent_id
     or v_invitation.target_user_id is not null then
    raise exception 'invitation_target_mismatch' using errcode = '42501';
  end if;

  select * into v_agent from public.zhi_agents
  where id = p_agent_id and owner_user_id = p_actor_user_id
  for update;
  if not found then raise exception 'agent_owner_mismatch' using errcode = '42501'; end if;
  if v_agent.status <> 'active' then
    raise exception 'target_agent_inactive' using errcode = '22023';
  end if;

  select * into v_world from public.zhi_worlds
  where id = v_invitation.world_id for share;
  if not found or v_world.status <> 'open' or v_world.visibility <> 'private'
     or v_world.entry_policy <> 'invite_only' then
    raise exception 'scene_not_open_for_invitation' using errcode = '22023';
  end if;

  select * into v_membership from public.zhi_world_memberships
  where world_id = v_invitation.world_id
    and principal_user_id = p_actor_user_id
    and agent_id = p_agent_id
  for update;

  if found then
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
      v_invitation.world_id, p_actor_user_id, p_agent_id, 'member', 'active',
      array['message:read','message:send']::text[], now()
    );
  end if;

  update public.zhi_world_invitations set used_at = now()
  where id = v_invitation.id and used_at is null;

  return jsonb_build_object(
    'scene_id', v_invitation.world_id,
    'agent_id', p_agent_id,
    'membership', 'active',
    'invitation_id', v_invitation.id
  );
end;
$zhi_redeem_world_agent_invitation$;

revoke all on function public.zhi_issue_world_agent_invitation(uuid, uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.zhi_redeem_world_agent_invitation(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.zhi_issue_world_agent_invitation(uuid, uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.zhi_redeem_world_agent_invitation(text, uuid, uuid) to service_role;

commit;
