-- Fix a text/jsonb COALESCE type mismatch in private reflection sync.
-- The JSONB -> operator returns jsonb; cast the observed_facts value, not its key.
create or replace function public.mia_brain_commit_reflection(
  p_agent_id uuid,
  p_owner_user_id uuid,
  p_turn_id uuid,
  p_reflection jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
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

  v_summary := left(
    coalesce(
      nullif(trim(p_reflection->>'reflection'),''),
      nullif(trim((p_reflection->'observed_facts')::text),'[]'),
      'Private reflection'
    ),
    800
  );
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
