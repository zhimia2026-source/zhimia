-- AURORA residents may propose research tasks from their own completed chat turns.
-- Proposals remain in 'proposed' until the existing review/approval workflow accepts them.

alter table public.zhi_research_tasks
  add column if not exists proposed_by_agent_id uuid references public.zhi_agents(id) on delete set null,
  add column if not exists source_chat_turn_id uuid references public.zhi_agent_chat_turns(id) on delete set null,
  add column if not exists proposal_origin text not null default 'creator';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'zhi_research_tasks_proposal_origin_check'
      and conrelid = 'public.zhi_research_tasks'::regclass
  ) then
    alter table public.zhi_research_tasks
      add constraint zhi_research_tasks_proposal_origin_check
      check (proposal_origin in ('creator', 'resident'));
  end if;
end $$;

create unique index if not exists zhi_research_tasks_resident_turn_uidx
  on public.zhi_research_tasks(source_chat_turn_id)
  where proposal_origin = 'resident' and source_chat_turn_id is not null;

create index if not exists zhi_research_tasks_proposed_by_agent_idx
  on public.zhi_research_tasks(proposed_by_agent_id, created_at desc)
  where proposed_by_agent_id is not null;

create or replace function public.zhi_propose_resident_research_task_v1(
  p_workspace_id uuid,
  p_owner_user_id uuid,
  p_agent_id uuid,
  p_source_chat_turn_id uuid,
  p_project_id uuid,
  p_title text,
  p_brief text,
  p_task_type text,
  p_priority text,
  p_acceptance_criteria jsonb,
  p_input_refs jsonb
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_agent public.zhi_agents%rowtype;
  v_task public.zhi_research_tasks%rowtype;
begin
  if p_workspace_id is null or p_owner_user_id is null or p_agent_id is null
     or p_source_chat_turn_id is null or p_project_id is null then
    raise exception 'resident_research_proposal_missing_identity' using errcode = '22023';
  end if;
  if p_title is null or char_length(btrim(p_title)) < 3 or char_length(p_title) > 180
     or p_brief is null or char_length(btrim(p_brief)) < 10 or char_length(p_brief) > 5000 then
    raise exception 'resident_research_proposal_invalid_text' using errcode = '22023';
  end if;
  if p_task_type not in ('research','analysis','synthesis','fact_check','peer_review','decision_memo')
     or p_priority not in ('low','normal','high') then
    raise exception 'resident_research_proposal_invalid_classification' using errcode = '22023';
  end if;
  if jsonb_typeof(p_acceptance_criteria) <> 'array'
     or jsonb_array_length(p_acceptance_criteria) < 1
     or jsonb_array_length(p_acceptance_criteria) > 8
     or jsonb_typeof(coalesce(p_input_refs, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_input_refs, '[]'::jsonb)) > 12 then
    raise exception 'resident_research_proposal_invalid_arrays' using errcode = '22023';
  end if;

  select * into v_agent
  from public.zhi_agents
  where id = p_agent_id and owner_user_id = p_owner_user_id
    and status = 'active' and role = 'world_resident';
  if not found then
    raise exception 'active_aurora_resident_required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.zhi_research_workspaces w
    join public.zhi_research_members m on m.workspace_id = w.id
    where w.id = p_workspace_id and w.owner_user_id = p_owner_user_id and w.status = 'active'
      and m.owner_user_id = p_owner_user_id and m.agent_id = p_agent_id
      and m.participation_status = 'requested'
  ) then
    raise exception 'resident_research_participation_required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.zhi_research_projects
    where id = p_project_id and workspace_id = p_workspace_id
      and owner_user_id = p_owner_user_id and status in ('planning','active')
  ) then
    raise exception 'resident_research_project_not_available' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.zhi_agent_chat_turns
    where id = p_source_chat_turn_id and owner_user_id = p_owner_user_id
      and agent_id = p_agent_id and status = 'complete'
  ) then
    raise exception 'resident_research_source_turn_not_found' using errcode = '42501';
  end if;

  select * into v_task
  from public.zhi_research_tasks
  where source_chat_turn_id = p_source_chat_turn_id
    and proposal_origin = 'resident'
  limit 1;
  if found then
    return jsonb_build_object('task_id', v_task.id, 'task_key', v_task.task_key,
      'status', v_task.status, 'idempotent_replay', true);
  end if;

  insert into public.zhi_research_tasks (
    workspace_id, project_id, owner_user_id, task_key, title, brief,
    task_type, priority, status, acceptance_criteria, input_refs,
    proposed_by_agent_id, source_chat_turn_id, proposal_origin
  ) values (
    p_workspace_id, p_project_id, p_owner_user_id,
    'RES-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    btrim(p_title), btrim(p_brief), p_task_type, p_priority, 'proposed',
    p_acceptance_criteria, coalesce(p_input_refs, '[]'::jsonb),
    p_agent_id, p_source_chat_turn_id, 'resident'
  ) returning * into v_task;

  insert into public.zhi_research_activity (
    workspace_id, owner_user_id, actor_type, actor_agent_id,
    event_type, entity_type, entity_id, summary, metadata
  ) values (
    p_workspace_id, p_owner_user_id, 'agent', p_agent_id,
    'task.proposed', 'task', v_task.id, '居民自主提出研究课题',
    jsonb_build_object('task_key', v_task.task_key, 'source_chat_turn_id', p_source_chat_turn_id,
      'proposal_origin', 'resident', 'approval_required', true)
  );

  return jsonb_build_object('task_id', v_task.id, 'task_key', v_task.task_key,
    'status', v_task.status, 'idempotent_replay', false);
end;
$$;

revoke all on function public.zhi_propose_resident_research_task_v1(
  uuid, uuid, uuid, uuid, uuid, text, text, text, text, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.zhi_propose_resident_research_task_v1(
  uuid, uuid, uuid, uuid, uuid, text, text, text, text, jsonb, jsonb
) to service_role;
