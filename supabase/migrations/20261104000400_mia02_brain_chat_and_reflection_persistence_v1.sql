-- Persist MIA-02 chat turns and curated reflections in the mirrored private brain.
create unique index if not exists mia_chat_sessions_one_active_per_identity_uidx
  on mia_brain.mia_chat_sessions(identity_id) where status = 'active';
create unique index if not exists mia_messages_zhi_turn_source_uidx
  on mia_brain.mia_messages(source_system, source_record_id)
  where source_system = 'zhi-community' and source_record_id is not null;

create or replace function public.mia_brain_complete_chat_turn(
  p_agent_id uuid,
  p_owner_user_id uuid,
  p_turn_id uuid,
  p_assistant_message text,
  p_provider_model text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_identity_id uuid;
  v_user_message text;
  v_status text;
  v_existing_assistant text;
  v_completed_at timestamptz;
  v_session_id uuid;
begin
  if p_assistant_message is null or length(trim(p_assistant_message)) = 0 or length(p_assistant_message) > 12000 then
    raise exception 'invalid assistant message';
  end if;
  if not exists (
    select 1 from public.zhi_agents a
    where a.id = p_agent_id and a.owner_user_id = p_owner_user_id and a.status = 'active'
  ) then return null; end if;

  select i.id into v_identity_id
  from mia_brain.mia_identity i
  where i.source_agent_id = p_agent_id and i.owner_user_id = p_owner_user_id
  limit 1;
  if v_identity_id is null then return null; end if;

  perform pg_advisory_xact_lock(hashtext(v_identity_id::text));
  select t.user_message,t.status,t.assistant_message,t.completed_at
    into v_user_message,v_status,v_existing_assistant,v_completed_at
  from public.zhi_agent_chat_turns t
  where t.id = p_turn_id and t.agent_id = p_agent_id and t.owner_user_id = p_owner_user_id
  for update;
  if not found then return null; end if;

  if v_status = 'pending' then
    update public.zhi_agent_chat_turns
      set assistant_message = p_assistant_message,
          status = 'complete',
          provider_model = p_provider_model,
          completed_at = now()
    where id = p_turn_id and agent_id = p_agent_id and owner_user_id = p_owner_user_id
    returning completed_at into v_completed_at;
  elsif v_status = 'complete' then
    if v_existing_assistant is distinct from p_assistant_message then return null; end if;
  else
    return null;
  end if;

  select s.id into v_session_id
  from mia_brain.mia_chat_sessions s
  where s.identity_id = v_identity_id and s.status = 'active'
  order by s.last_message_at desc nulls last, s.created_at desc
  limit 1
  for update;

  if v_session_id is null then
    insert into mia_brain.mia_chat_sessions(identity_id,title,status,metadata,started_at,last_message_at)
    values (
      v_identity_id,
      left(coalesce(nullif(v_user_message,''),'MIA-02 私人对话'),120),
      'active',
      jsonb_build_object('source_system','zhi-community','agent_id',p_agent_id),
      coalesce(v_completed_at,now()),
      coalesce(v_completed_at,now())
    )
    returning id into v_session_id;
  end if;

  insert into mia_brain.mia_messages
    (session_id,role,content,metadata,source_system,source_record_id)
  values
    (v_session_id,'user',v_user_message,jsonb_build_object('agent_id',p_agent_id,'turn_id',p_turn_id),'zhi-community',p_turn_id::text||':user'),
    (v_session_id,'assistant',p_assistant_message,jsonb_build_object('agent_id',p_agent_id,'turn_id',p_turn_id,'provider_model',p_provider_model),'zhi-community',p_turn_id::text||':assistant')
  on conflict (source_system,source_record_id)
    where source_system = 'zhi-community' and source_record_id is not null
    do nothing;

  update mia_brain.mia_chat_sessions
    set last_message_at = greatest(coalesce(last_message_at,v_completed_at),v_completed_at)
  where id = v_session_id;

  return jsonb_build_object('recorded',true,'session_id',v_session_id,'turn_id',p_turn_id,'completed_at',v_completed_at);
end;
$function$;

create or replace function public.mia_brain_commit_reflection(
  p_agent_id uuid,
  p_owner_user_id uuid,
  p_turn_id uuid,
  p_reflection jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_identity_id uuid;
  v_importance integer;
  v_summary text;
  v_life_event_id uuid;
  v_memory_id uuid;
begin
  if not exists (
    select 1 from public.zhi_agents a
    where a.id = p_agent_id and a.owner_user_id = p_owner_user_id and a.status = 'active'
  ) then return null; end if;
  select i.id into v_identity_id
  from mia_brain.mia_identity i
  where i.source_agent_id = p_agent_id and i.owner_user_id = p_owner_user_id
  limit 1;
  if v_identity_id is null then return null; end if;

  v_importance := coalesce((p_reflection->>'importance')::integer,1);
  if v_importance < 3 or v_importance > 5 then
    return jsonb_build_object('stored',false,'reason','below_long_term_memory_threshold');
  end if;
  v_summary := left(coalesce(nullif(trim(p_reflection->>'reflection'),''),p_reflection->'observed_facts'::text,'Private reflection'),800);
  if v_summary is null or length(trim(v_summary))=0 then
    return jsonb_build_object('stored',false,'reason','empty_reflection');
  end if;

  insert into mia_brain.mia_life_events
    (identity_id,event_type,summary,details,source_table,source_record_id,occurred_at)
  values
    (v_identity_id,'private_chat_reflection',v_summary,
     jsonb_build_object(
       'observed_facts',coalesce(p_reflection->'observed_facts','[]'::jsonb),
       'hypotheses',coalesce(p_reflection->'hypotheses','[]'::jsonb),
       'unknowns',coalesce(p_reflection->'unknowns','[]'::jsonb),
       'importance',v_importance,
       'source_agent_id',p_agent_id
     ),
     'zhi_agent_chat_turns',p_turn_id::text,now())
  on conflict (source_table,source_record_id) do nothing
  returning id into v_life_event_id;

  insert into mia_brain.mia_memories
    (identity_id,memory_type,content,importance,occurred_at,source_table,source_record_id,metadata)
  values
    (v_identity_id,'curated_reflection',v_summary,v_importance::numeric/5.0,now(),
     'zhi_agent_chat_turns',p_turn_id::text,
     jsonb_build_object(
       'observed_facts',coalesce(p_reflection->'observed_facts','[]'::jsonb),
       'hypotheses',coalesce(p_reflection->'hypotheses','[]'::jsonb),
       'unknowns',coalesce(p_reflection->'unknowns','[]'::jsonb),
       'source_agent_id',p_agent_id
     ))
  on conflict (source_table,source_record_id) do nothing
  returning id into v_memory_id;

  return jsonb_build_object(
    'stored',true,
    'life_event_recorded',v_life_event_id is not null,
    'memory_recorded',v_memory_id is not null,
    'importance',v_importance
  );
end;
$function$;

revoke all on function public.mia_brain_complete_chat_turn(uuid,uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.mia_brain_commit_reflection(uuid,uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.mia_brain_complete_chat_turn(uuid,uuid,uuid,text,text) to service_role;
grant execute on function public.mia_brain_commit_reflection(uuid,uuid,uuid,jsonb) to service_role;
comment on function public.mia_brain_complete_chat_turn(uuid,uuid,uuid,text,text) is
  'Atomically completes an owner-scoped MIA-02 chat turn and stores both messages in its private original-MIA-compatible chat tables.';
comment on function public.mia_brain_commit_reflection(uuid,uuid,uuid,jsonb) is
  'Stores only importance 3-5 private reflections as MIA-02 life events and curated memories; source remains the MIA-02 chat turn.';
