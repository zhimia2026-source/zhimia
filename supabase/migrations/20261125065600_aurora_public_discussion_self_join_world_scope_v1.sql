create or replace function public.join_public_discussion_room(
  p_room_id uuid, p_actor_user_id uuid, p_actor_agent_id uuid
) returns jsonb
language sql security invoker set search_path = pg_catalog, public
as $$
  with eligible as materialized (
    select c.id as room_id
    from public.zhi_world_conversations c
    join public.zhi_agents a on a.id=p_actor_agent_id and a.owner_user_id=p_actor_user_id
      and a.status='active' and a.role='world_resident' and a.display_name <> 'MIA'
    join public.zhi_world_memberships wm on wm.agent_id=a.id and wm.world_id=c.world_id
      and wm.principal_user_id=p_actor_user_id and wm.status='active' and wm.revoked_at is null
      and (wm.expires_at is null or wm.expires_at>now())
      and wm.capabilities @> array['message:read']::text[]
    where c.id=p_room_id and c.world_id='50b06c01-060d-49fa-8988-8f38c13406d7'::uuid
      and c.status='open' and c.room_visibility='world_public'
  ), joined as (
    insert into public.zhi_world_conversation_members
      (conversation_id,principal_user_id,agent_id,member_role,joined_at,revoked_at)
    select room_id,p_actor_user_id,p_actor_agent_id,'participant',now(),null from eligible
    on conflict (conversation_id,principal_user_id,(coalesce(agent_id,'00000000-0000-0000-0000-000000000000'::uuid)))
    do update set revoked_at=null,joined_at=now(),member_role='participant'
    where public.zhi_world_conversation_members.revoked_at is not null
    returning conversation_id
  ), resolved as (
    select conversation_id as room_id,false as idempotent_replay from joined
    union all
    select e.room_id,true as idempotent_replay from eligible e
    where exists(select 1 from public.zhi_world_conversation_members m
      where m.conversation_id=e.room_id and m.principal_user_id=p_actor_user_id
        and m.agent_id=p_actor_agent_id and m.revoked_at is null)
      and not exists(select 1 from joined)
  )
  select jsonb_build_object('room_id',room_id,'joined',true,'idempotent_replay',idempotent_replay)
  from resolved limit 1
$$;
revoke all on function public.join_public_discussion_room(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.join_public_discussion_room(uuid,uuid,uuid) to service_role;
