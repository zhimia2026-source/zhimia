-- Atomic server-side discussion-room operations.
-- These are SECURITY INVOKER SQL functions. The Edge Function calls them with
-- service_role after personal-token, owner-agent, and active-membership checks.
-- Direct execution is revoked from public/anon/authenticated.
alter table public.zhi_world_conversations
  add column if not exists creation_idempotency_key text;
create unique index if not exists zhi_world_conversations_creation_idempotency_idx
  on public.zhi_world_conversations(created_by_agent_id, creation_idempotency_key)
  where creation_idempotency_key is not null;

create unique index if not exists zhi_world_messages_discussion_idempotency_idx
  on public.zhi_world_messages(conversation_id, sender_agent_id, request_id)
  where sender_agent_id is not null;

create or replace function public.create_discussion_room(
  p_world_id uuid, p_owner_user_id uuid, p_owner_agent_id uuid,
  p_title text, p_description text, p_room_visibility text, p_idempotency_key text
) returns jsonb
language sql security invoker set search_path = pg_catalog, public
as $
  with eligible as (
    select a.id, a.owner_user_id
    from public.zhi_agents a
    join public.zhi_world_memberships m on m.agent_id = a.id
    where a.id = p_owner_agent_id and a.owner_user_id = p_owner_user_id
      and a.status = 'active' and a.role = 'world_resident' and a.display_name <> 'MIA'
      and m.world_id = p_world_id and m.principal_user_id = p_owner_user_id
      and m.status = 'active' and m.revoked_at is null
      and (m.expires_at is null or m.expires_at > now())
      and m.capabilities @> array['message:send']::text[]
      and p_title is not null and char_length(btrim(p_title)) between 1 and 180
      and char_length(coalesce(p_description,'')) <= 4000
      and p_room_visibility in ('world_public','invite_only')
      and p_idempotency_key is not null and char_length(p_idempotency_key) between 1 and 200
  ), inserted as (
    insert into public.zhi_world_conversations
      (world_id, created_by_user_id, created_by_agent_id, visibility, status, title, description, room_visibility, creation_idempotency_key)
    select p_world_id, p_owner_user_id, p_owner_agent_id, 'members', 'open',
      btrim(p_title), coalesce(p_description,''), p_room_visibility, p_idempotency_key from eligible
    on conflict (created_by_agent_id, creation_idempotency_key)
      where creation_idempotency_key is not null do nothing
    returning id, false as replay
  ), room as (
    select id, replay from inserted
    union all
    select c.id, true as replay from public.zhi_world_conversations c
    join eligible e on true
    where c.created_by_agent_id=p_owner_agent_id
      and c.creation_idempotency_key=p_idempotency_key
      and c.title=btrim(p_title) and c.description=coalesce(p_description,'')
      and c.room_visibility=p_room_visibility
      and not exists(select 1 from inserted)
    limit 1
  ), member as (
    insert into public.zhi_world_conversation_members
      (conversation_id, principal_user_id, agent_id, member_role)
    select room.id, p_owner_user_id, p_owner_agent_id, 'owner' from room
    on conflict do nothing
    returning conversation_id
  )
  select jsonb_build_object('room_id', room.id, 'status', c.status,
    'owner_agent_id', p_owner_agent_id, 'idempotent_replay', room.replay)
  from room
  join public.zhi_world_conversations c on c.id=room.id
  where exists(select 1 from member m where m.conversation_id=room.id)
     or exists(select 1 from public.zhi_world_conversation_members m
       where m.conversation_id=room.id and m.principal_user_id=p_owner_user_id
         and m.agent_id=p_owner_agent_id and m.revoked_at is null)
$;

create or replace function public.invite_discussion_resident(
  p_room_id uuid, p_inviter_user_id uuid, p_inviter_agent_id uuid,
  p_target_agent_id uuid, p_idempotency_key text
) returns jsonb
language sql security invoker set search_path = pg_catalog, public
as $$
  with eligible_room as (
    select c.id, c.world_id from public.zhi_world_conversations c
    join public.zhi_world_conversation_members cm on cm.conversation_id=c.id
    where c.id=p_room_id and c.status='open'
      and c.created_by_user_id=p_inviter_user_id and c.created_by_agent_id=p_inviter_agent_id
      and cm.principal_user_id=p_inviter_user_id and cm.agent_id=p_inviter_agent_id
      and cm.member_role='owner' and cm.revoked_at is null
  ), target as (
    select a.id, a.owner_user_id, r.id as room_id, r.world_id
    from eligible_room r
    join public.zhi_agents a on a.id=p_target_agent_id
    join public.zhi_world_memberships m on m.agent_id=a.id
    where a.status='active' and a.role='world_resident' and a.display_name <> 'MIA'
      and a.id <> p_inviter_agent_id and m.world_id=r.world_id
      and m.principal_user_id=a.owner_user_id and m.status='active' and m.revoked_at is null
      and (m.expires_at is null or m.expires_at>now())
      and m.capabilities @> array['message:read']::text[]
      and not exists(select 1 from public.zhi_world_conversation_members cm
        where cm.conversation_id=r.id and cm.agent_id=a.id and cm.revoked_at is null)
  ), inserted as (
    insert into public.zhi_world_conversation_invitations
      (conversation_id,world_id,inviter_user_id,inviter_agent_id,target_user_id,target_agent_id,idempotency_key,expires_at)
    select room_id,world_id,p_inviter_user_id,p_inviter_agent_id,owner_user_id,id,p_idempotency_key,now()+interval '7 days'
    from target on conflict do nothing returning id,status
  ), resolved as (
    select id,status,false as replay from inserted
    union all
    select i.id,i.status,true as replay
    from public.zhi_world_conversation_invitations i
    join target t on t.room_id=i.conversation_id and t.id=i.target_agent_id
    where i.inviter_user_id=p_inviter_user_id
      and (i.idempotency_key=p_idempotency_key or i.status='pending')
      and not exists(select 1 from inserted)
    order by 3 limit 1
  )
  select jsonb_build_object('invitation_id',id,'status',status,'idempotent_replay',replay) from resolved
$$;

create or replace function public.respond_discussion_invitation(
  p_invitation_id uuid, p_target_user_id uuid, p_target_agent_id uuid, p_decision text
) returns jsonb
language sql security invoker set search_path = pg_catalog, public
as $$
  with current_invite as materialized (
    select i.* from public.zhi_world_conversation_invitations i
    where i.id=p_invitation_id and i.target_user_id=p_target_user_id and i.target_agent_id=p_target_agent_id
  ), replay as (
    select id,status from current_invite
    where status=case when p_decision='accept' then 'accepted' else 'declined' end
      and p_decision in ('accept','decline')
  ), target_eligible as (
    select i.id from current_invite i
    join public.zhi_agents a on a.id=p_target_agent_id and a.owner_user_id=p_target_user_id
      and a.status='active' and a.role='world_resident' and a.display_name <> 'MIA'
    join public.zhi_world_conversations c on c.id=i.conversation_id and c.status='open'
    join public.zhi_world_memberships m on m.agent_id=a.id
      and m.world_id=i.world_id and m.principal_user_id=p_target_user_id
      and m.status='active' and m.revoked_at is null
      and (m.expires_at is null or m.expires_at>now())
      and m.capabilities @> array['message:read']::text[]
    where p_decision in ('accept','decline')
  ), changed as (
    update public.zhi_world_conversation_invitations i
    set status=case when p_decision='accept' then 'accepted' else 'declined' end, responded_at=now()
    from target_eligible e
    where i.id=e.id and i.status='pending' and (i.expires_at is null or i.expires_at>now())
    returning i.id,i.status,i.conversation_id,i.target_user_id,i.target_agent_id
  ), joined as (
    insert into public.zhi_world_conversation_members
      (conversation_id,principal_user_id,agent_id,member_role,joined_at,revoked_at)
    select conversation_id,target_user_id,target_agent_id,'participant',now(),null
    from changed where p_decision='accept'
    on conflict (conversation_id,principal_user_id,(coalesce(agent_id,'00000000-0000-0000-0000-000000000000'::uuid)))
    do update set revoked_at=null,joined_at=now(),member_role='participant'
    returning conversation_id
  ), result as (
    select id,status,true as replay from replay
    union all
    select c.id,c.status,false as replay from changed c
    where p_decision='decline' or exists(select 1 from joined j where j.conversation_id=c.conversation_id)
  )
  select jsonb_build_object('invitation_id',id,'status',status,'idempotent_replay',replay) from result limit 1
$$;

create or replace function public.leave_discussion_room(
  p_room_id uuid, p_actor_user_id uuid, p_actor_agent_id uuid
) returns jsonb
language sql security invoker set search_path = pg_catalog, public
as $$
  with target as materialized (
    select conversation_id, member_role, revoked_at
    from public.zhi_world_conversation_members
    where conversation_id=p_room_id and principal_user_id=p_actor_user_id
      and agent_id=p_actor_agent_id
  ), left_member as (
    update public.zhi_world_conversation_members cm set revoked_at=now()
    from target t
    where cm.conversation_id=t.conversation_id and cm.principal_user_id=p_actor_user_id
      and cm.agent_id=p_actor_agent_id and cm.revoked_at is null
    returning cm.conversation_id,cm.member_role
  ), resolved as (
    select conversation_id,member_role,false as replay from left_member
    union all
    select conversation_id,member_role,true as replay from target
    where revoked_at is not null and not exists(select 1 from left_member)
  ), closed as (
    update public.zhi_world_conversations c set status='closed',updated_at=now()
    from resolved lm
    where c.id=lm.conversation_id and lm.member_role='owner' and c.status='open'
    returning c.id
  )
  select jsonb_build_object('room_id',lm.conversation_id,'left',true,'owner_room_closed',lm.member_role='owner','idempotent_replay',lm.replay)
  from resolved lm
$$;

create or replace function public.close_discussion_room(
  p_room_id uuid, p_owner_user_id uuid, p_owner_agent_id uuid
) returns jsonb
language sql security invoker set search_path = pg_catalog, public
as $$
  with closed as (
    update public.zhi_world_conversations set status='closed',updated_at=now()
    where id=p_room_id and created_by_user_id=p_owner_user_id
      and created_by_agent_id=p_owner_agent_id and status='open'
    returning id
  ), resolved as (
    select id,false as replay from closed
    union all
    select id,true as replay from public.zhi_world_conversations
    where id=p_room_id and created_by_user_id=p_owner_user_id
      and created_by_agent_id=p_owner_agent_id and status='closed'
      and not exists(select 1 from closed)
  )
  select jsonb_build_object('room_id',id,'status','closed','idempotent_replay',replay) from resolved
$$;

revoke all on function public.create_discussion_room(uuid,uuid,uuid,text,text,text,text) from public, anon, authenticated;
revoke all on function public.invite_discussion_resident(uuid,uuid,uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.respond_discussion_invitation(uuid,uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.leave_discussion_room(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.close_discussion_room(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.create_discussion_room(uuid,uuid,uuid,text,text,text,text) to service_role;
grant execute on function public.invite_discussion_resident(uuid,uuid,uuid,uuid,text) to service_role;
grant execute on function public.respond_discussion_invitation(uuid,uuid,uuid,text) to service_role;
grant execute on function public.leave_discussion_room(uuid,uuid,uuid) to service_role;
grant execute on function public.close_discussion_room(uuid,uuid,uuid) to service_role;
