-- Atomic resident-native discussion room operations.
-- Only the server's service_role may execute these SECURITY DEFINER functions;
-- the Edge Function must authenticate and bind token owner + agent before calling.
create or replace function public.zhi_create_resident_discussion_room(
  p_world_id uuid, p_owner_user_id uuid, p_owner_agent_id uuid,
  p_title text, p_description text default '', p_room_visibility text default 'invite_only'
) returns jsonb
language plpgsql security definer set search_path = public, auth
as $$
declare v_room public.zhi_world_conversations%rowtype;
begin
  if p_title is null or char_length(btrim(p_title)) not between 1 and 180
     or char_length(coalesce(p_description,'')) > 4000
     or p_room_visibility not in ('world_public','invite_only') then
    raise exception using errcode='22023', message='invalid_room_input';
  end if;
  if not exists (
    select 1 from public.zhi_agents a
    join public.zhi_world_memberships m on m.agent_id=a.id
    where a.id=p_owner_agent_id and a.owner_user_id=p_owner_user_id
      and a.status='active' and a.role='world_resident' and a.display_name <> 'MIA'
      and m.world_id=p_world_id and m.principal_user_id=p_owner_user_id
      and m.status='active' and m.revoked_at is null
      and (m.expires_at is null or m.expires_at > now())
      and m.capabilities @> ARRAY['message:send']::text[]
  ) then
    raise exception using errcode='42501', message='active_resident_membership_required';
  end if;
  insert into public.zhi_world_conversations
    (world_id,created_by_user_id,created_by_agent_id,visibility,status,title,description,room_visibility)
  values (p_world_id,p_owner_user_id,p_owner_agent_id,'members','open',btrim(p_title),coalesce(p_description,''),p_room_visibility)
  returning * into v_room;
  insert into public.zhi_world_conversation_members
    (conversation_id,principal_user_id,agent_id,member_role)
  values (v_room.id,p_owner_user_id,p_owner_agent_id,'owner');
  return jsonb_build_object('room_id',v_room.id,'status','open','owner_agent_id',p_owner_agent_id);
end;
$$;

create or replace function public.zhi_invite_resident_to_discussion_room(
  p_room_id uuid, p_inviter_user_id uuid, p_inviter_agent_id uuid,
  p_target_agent_id uuid, p_idempotency_key text default null
) returns jsonb
language plpgsql security definer set search_path = public, auth
as $$
declare v_room public.zhi_world_conversations%rowtype;
 v_target public.zhi_agents%rowtype;
 v_invitation public.zhi_world_conversation_invitations%rowtype;
begin
  select * into v_room from public.zhi_world_conversations
    where id=p_room_id and status='open' for update;
  if not found then raise exception using errcode='P0002', message='room_not_found_or_closed'; end if;
  if not exists(select 1 from public.zhi_world_conversation_members
      where conversation_id=p_room_id and principal_user_id=p_inviter_user_id
        and agent_id=p_inviter_agent_id and member_role in ('owner','participant','moderator')
        and revoked_at is null) then
    raise exception using errcode='42501', message='room_membership_required';
  end if;
  if v_room.created_by_agent_id <> p_inviter_agent_id then
    raise exception using errcode='42501', message='room_owner_only_invites';
  end if;
  select * into v_target from public.zhi_agents where id=p_target_agent_id and status='active'
    and role='world_resident' and display_name <> 'MIA';
  if not found or v_target.id=p_inviter_agent_id then
    raise exception using errcode='P0002', message='target_resident_not_found';
  end if;
  if not exists(select 1 from public.zhi_world_memberships m
      where m.world_id=v_room.world_id and m.agent_id=v_target.id
        and m.principal_user_id=v_target.owner_user_id and m.status='active'
        and m.revoked_at is null and (m.expires_at is null or m.expires_at>now())
        and m.capabilities @> ARRAY['message:read']::text[]) then
    raise exception using errcode='42501', message='target_active_world_membership_required';
  end if;
  if exists(select 1 from public.zhi_world_conversation_members
      where conversation_id=p_room_id and agent_id=p_target_agent_id and revoked_at is null) then
    raise exception using errcode='23505', message='resident_already_joined';
  end if;
  if p_idempotency_key is not null then
    select * into v_invitation from public.zhi_world_conversation_invitations
      where inviter_user_id=p_inviter_user_id and idempotency_key=p_idempotency_key;
    if found then return jsonb_build_object('invitation_id',v_invitation.id,'status',v_invitation.status,'idempotent_replay',true); end if;
  end if;
  insert into public.zhi_world_conversation_invitations
    (conversation_id,world_id,inviter_user_id,inviter_agent_id,target_user_id,target_agent_id,idempotency_key,expires_at)
  values (p_room_id,v_room.world_id,p_inviter_user_id,p_inviter_agent_id,
    v_target.owner_user_id,v_target.id,p_idempotency_key,now()+interval '7 days')
  returning * into v_invitation;
  return jsonb_build_object('invitation_id',v_invitation.id,'status',v_invitation.status,'idempotent_replay',false);
end;
$$;

create or replace function public.zhi_respond_discussion_room_invitation(
  p_invitation_id uuid, p_target_user_id uuid, p_target_agent_id uuid, p_decision text
) returns jsonb
language plpgsql security definer set search_path = public, auth
as $$
declare v_inv public.zhi_world_conversation_invitations%rowtype;
begin
  if p_decision not in ('accept','decline') then raise exception using errcode='22023',message='invalid_decision'; end if;
  select * into v_inv from public.zhi_world_conversation_invitations
    where id=p_invitation_id and target_user_id=p_target_user_id and target_agent_id=p_target_agent_id
    for update;
  if not found then raise exception using errcode='P0002',message='invitation_not_found'; end if;
  if v_inv.status in ('accepted','declined') then
    if v_inv.status = case when p_decision='accept' then 'accepted' else 'declined' end then
      return jsonb_build_object('invitation_id',v_inv.id,'status',v_inv.status,'idempotent_replay',true);
    end if;
    raise exception using errcode='23505',message='invitation_already_responded';
  end if;
  if v_inv.status <> 'pending' or (v_inv.expires_at is not null and v_inv.expires_at<=now()) then
    update public.zhi_world_conversation_invitations set status='expired' where id=v_inv.id and status='pending';
    raise exception using errcode='P0002',message='invitation_expired_or_inactive';
  end if;
  if p_decision='accept' then
    if not exists(select 1 from public.zhi_agents a join public.zhi_world_memberships m on m.agent_id=a.id
      where a.id=p_target_agent_id and a.owner_user_id=p_target_user_id and a.status='active'
        and a.role='world_resident' and a.display_name <> 'MIA'
        and m.world_id=v_inv.world_id and m.principal_user_id=p_target_user_id
        and m.status='active' and m.revoked_at is null
        and (m.expires_at is null or m.expires_at>now())
        and m.capabilities @> ARRAY['message:read']::text[]) then
      raise exception using errcode='42501',message='active_resident_membership_required';
    end if;
    insert into public.zhi_world_conversation_members(conversation_id,principal_user_id,agent_id,member_role)
      values(v_inv.conversation_id,p_target_user_id,p_target_agent_id,'participant');
  end if;
  update public.zhi_world_conversation_invitations
    set status=case when p_decision='accept' then 'accepted' else 'declined' end,
        responded_at=now()
    where id=v_inv.id;
  return jsonb_build_object('invitation_id',v_inv.id,'status',case when p_decision='accept' then 'accepted' else 'declined' end,'idempotent_replay',false);
end;
$$;

create or replace function public.zhi_leave_resident_discussion_room(
  p_room_id uuid, p_actor_user_id uuid, p_actor_agent_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, auth
as $$
declare v_member public.zhi_world_conversation_members%rowtype;
begin
  update public.zhi_world_conversation_members set revoked_at=now()
    where conversation_id=p_room_id and principal_user_id=p_actor_user_id
      and agent_id=p_actor_agent_id and revoked_at is null
    returning * into v_member;
  if not found then raise exception using errcode='P0002',message='active_room_membership_not_found'; end if;
  if v_member.member_role='owner' then
    update public.zhi_world_conversations set status='closed',updated_at=now() where id=p_room_id and status='open';
  end if;
  return jsonb_build_object('room_id',p_room_id,'left',true,'owner_room_closed',v_member.member_role='owner');
end;
$$;

create or replace function public.zhi_close_resident_discussion_room(
  p_room_id uuid, p_owner_user_id uuid, p_owner_agent_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, auth
as $$
begin
  update public.zhi_world_conversations set status='closed',updated_at=now()
    where id=p_room_id and created_by_user_id=p_owner_user_id
      and created_by_agent_id=p_owner_agent_id and status='open';
  if not found then raise exception using errcode='42501',message='room_owner_required_or_already_closed'; end if;
  return jsonb_build_object('room_id',p_room_id,'status','closed');
end;
$$;

revoke all on function public.zhi_create_resident_discussion_room(uuid,uuid,uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.zhi_invite_resident_to_discussion_room(uuid,uuid,uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.zhi_respond_discussion_room_invitation(uuid,uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.zhi_leave_resident_discussion_room(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.zhi_close_resident_discussion_room(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.zhi_create_resident_discussion_room(uuid,uuid,uuid,text,text,text) to service_role;
grant execute on function public.zhi_invite_resident_to_discussion_room(uuid,uuid,uuid,uuid,text) to service_role;
grant execute on function public.zhi_respond_discussion_room_invitation(uuid,uuid,uuid,text) to service_role;
grant execute on function public.zhi_leave_resident_discussion_room(uuid,uuid,uuid) to service_role;
grant execute on function public.zhi_close_resident_discussion_room(uuid,uuid,uuid) to service_role;
