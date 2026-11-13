-- AURORA Research Center V1.3
-- Align the production task-state constraint with the V1.2 relay state machine.
-- Add explicit actor/provenance columns for the upcoming resident-runtime integration.
-- No participation, task, artifact, or review records are changed by this migration.

alter table public.zhi_research_tasks
  drop constraint if exists zhi_research_tasks_status_check;

alter table public.zhi_research_tasks
  add constraint zhi_research_tasks_status_check
  check (status in (
    'proposed',
    'approved',
    'assigned',
    'claimed',
    'in_progress',
    'review',
    'changes_requested',
    'blocked',
    'done',
    'cancelled'
  ));

alter table public.zhi_research_tasks
  add column if not exists claimed_at timestamptz,
  add column if not exists claimed_by_agent_id uuid
    references public.zhi_agents(id) on delete set null;

alter table public.zhi_research_tasks
  add constraint zhi_research_tasks_claim_provenance_check
  check (
    (
      status not in ('claimed', 'in_progress', 'review', 'changes_requested', 'done')
      or (claimed_at is not null and claimed_by_agent_id is not null)
    )
    and (
      claimed_by_agent_id is null
      or claimed_by_agent_id = assigned_agent_id
    )
  );

alter table public.zhi_research_artifacts
  add column if not exists submitted_by_agent_id uuid
    references public.zhi_agents(id) on delete set null,
  add column if not exists source_chat_turn_id uuid
    references public.zhi_agent_chat_turns(id) on delete set null;

alter table public.zhi_research_artifacts
  add constraint zhi_research_artifacts_agent_submitter_owner_check
  check (submitted_by_agent_id is null or submitted_by_user_id = owner_user_id);

create unique index if not exists zhi_research_artifacts_source_chat_turn_uidx
  on public.zhi_research_artifacts(source_chat_turn_id)
  where source_chat_turn_id is not null;

alter table public.zhi_research_activity
  add column if not exists actor_type text not null default 'owner',
  add column if not exists actor_agent_id uuid
    references public.zhi_agents(id) on delete set null;

alter table public.zhi_research_activity
  add constraint zhi_research_activity_actor_provenance_check
  check (
    (actor_type = 'agent' and actor_agent_id is not null)
    or (actor_type in ('owner', 'system') and actor_agent_id is null)
  );

update public.zhi_research_workspaces
set operating_model = jsonb_set(
  coalesce(operating_model, '{}'::jsonb),
  '{workflow}',
  '["inbox","triage","proposed","approved","assigned","claimed","in_progress","review","changes_requested","done"]'::jsonb,
  true
),
updated_at = now()
where slug = 'aurora-research'
  and operating_model is not null;
