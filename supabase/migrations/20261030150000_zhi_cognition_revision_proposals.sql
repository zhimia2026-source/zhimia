-- ZHI Cognition Revision Proposals v0.1
-- Proposals are private, owner-reviewed, and never mutate cognition records.
begin;

create unique index if not exists zhi_cognition_record_id_owner_agent_unique_idx
  on public.zhi_agent_cognition_records (id, owner_user_id, agent_id);

create table if not exists public.zhi_cognition_revision_proposals (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid not null,
  target_object_type text not null check (
    target_object_type in ('self','other','world','relation','change','feedback')
  ),
  target_object_id text not null check (char_length(btrim(target_object_id)) between 1 and 200),
  based_on_record_id uuid not null,
  based_on_version integer not null check (based_on_version >= 1),
  proposed_state jsonb not null check (jsonb_typeof(proposed_state) = 'object'),
  status text not null default 'shadow_proposed' check (
    status in ('shadow_proposed','approved','rejected','stale')
  ),
  requires_human_review boolean not null default true check (requires_human_review),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  reviewer_user_id uuid references auth.users(id) on delete set null,
  decision_note text,
  constraint zhi_revision_proposal_id_owner_agent_unique unique (id, owner_user_id, agent_id),
  constraint zhi_revision_proposal_owner_agent_fk
    foreign key (agent_id, owner_user_id)
    references public.zhi_agents (id, owner_user_id) on delete cascade,
  constraint zhi_revision_proposal_base_record_fk
    foreign key (based_on_record_id, owner_user_id, agent_id)
    references public.zhi_agent_cognition_records (id, owner_user_id, agent_id) on delete restrict,
  constraint zhi_revision_proposal_decision_check check (
    (status = 'shadow_proposed' and decided_at is null and reviewer_user_id is null)
    or
    (status in ('approved','rejected','stale') and decided_at is not null)
  ),
  constraint zhi_revision_proposal_note_check check (
    decision_note is null or char_length(decision_note) <= 2000
  )
);

create index if not exists zhi_revision_proposals_owner_agent_time_idx
  on public.zhi_cognition_revision_proposals (owner_user_id, agent_id, created_at desc);

create table if not exists public.zhi_cognition_revision_proposal_feedback (
  proposal_id uuid not null,
  owner_user_id uuid not null,
  agent_id uuid not null,
  feedback_record_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (proposal_id, feedback_record_id),
  constraint zhi_revision_feedback_proposal_fk
    foreign key (proposal_id, owner_user_id, agent_id)
    references public.zhi_cognition_revision_proposals (id, owner_user_id, agent_id) on delete cascade,
  constraint zhi_revision_feedback_record_fk
    foreign key (feedback_record_id, owner_user_id, agent_id)
    references public.zhi_agent_cognition_records (id, owner_user_id, agent_id) on delete restrict
);

create index if not exists zhi_revision_feedback_record_idx
  on public.zhi_cognition_revision_proposal_feedback (feedback_record_id);

alter table public.zhi_agent_cognition_records
  add column if not exists change_kind text not null default 'initial'
    check (change_kind in ('initial','approved_revision','rollback')),
  add column if not exists previous_record_id uuid,
  add column if not exists source_proposal_id uuid;

alter table public.zhi_agent_cognition_records
  add constraint zhi_cognition_previous_record_fk
    foreign key (previous_record_id, owner_user_id, agent_id)
    references public.zhi_agent_cognition_records (id, owner_user_id, agent_id) on delete restrict,
  add constraint zhi_cognition_source_proposal_fk
    foreign key (source_proposal_id, owner_user_id, agent_id)
    references public.zhi_cognition_revision_proposals (id, owner_user_id, agent_id) on delete restrict,
  add constraint zhi_cognition_change_metadata_check check (
    (change_kind = 'initial' and previous_record_id is null and source_proposal_id is null)
    or (change_kind = 'approved_revision' and previous_record_id is not null and source_proposal_id is not null)
    or (change_kind = 'rollback' and previous_record_id is not null and source_proposal_id is null)
  );

alter table public.zhi_cognition_revision_proposals enable row level security;
alter table public.zhi_cognition_revision_proposal_feedback enable row level security;
revoke all on table public.zhi_cognition_revision_proposals,
  public.zhi_cognition_revision_proposal_feedback from anon, authenticated;
grant all on table public.zhi_cognition_revision_proposals,
  public.zhi_cognition_revision_proposal_feedback to service_role;

comment on table public.zhi_cognition_revision_proposals is
  'Private proposed cognition changes. Always requires explicit owner review; proposal creation never mutates cognition state.';
comment on table public.zhi_cognition_revision_proposal_feedback is
  'Owner/agent-scoped evidence links; composite foreign keys prevent cross-principal feedback attachment.';

-- Atomically persist a proposal and its evidence links after checking all feedback records.
create or replace function public.zhi_create_cognition_revision_proposal(
  p_owner_user_id uuid,
  p_agent_id uuid,
  p_based_on_record_id uuid,
  p_feedback_record_ids uuid[],
  p_proposed_state jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $zhi_create_cognition_revision_proposal$
declare
  v_base public.zhi_agent_cognition_records%rowtype;
  v_proposal public.zhi_cognition_revision_proposals%rowtype;
  v_feedback_count integer;
begin
  if p_owner_user_id is null or p_agent_id is null or p_based_on_record_id is null
     or p_feedback_record_ids is null or cardinality(p_feedback_record_ids) < 1
     or cardinality(p_feedback_record_ids) > 20
     or p_proposed_state is null or jsonb_typeof(p_proposed_state) <> 'object' then
    raise exception 'invalid_revision_proposal_arguments' using errcode = '22023';
  end if;

  if cardinality(p_feedback_record_ids) <> (
    select count(distinct feedback_id) from unnest(p_feedback_record_ids) as ids(feedback_id)
  ) then
    raise exception 'duplicate_feedback_records' using errcode = '22023';
  end if;

  select * into v_base
  from public.zhi_agent_cognition_records
  where id = p_based_on_record_id
    and owner_user_id = p_owner_user_id
    and agent_id = p_agent_id
  for share;
  if not found then raise exception 'base_record_not_found' using errcode = 'P0002'; end if;
  if v_base.evidence_kind <> 'hypothesis' or nullif(btrim(v_base.prediction), '') is null then
    raise exception 'base_record_must_be_predictive_hypothesis' using errcode = '22023';
  end if;

  select count(*) into v_feedback_count
  from public.zhi_agent_cognition_records f
  where f.id = any(p_feedback_record_ids)
    and f.owner_user_id = p_owner_user_id
    and f.agent_id = p_agent_id
    and f.object_type = 'feedback'
    and f.evidence_kind = 'observation'
    and f.object_id = v_base.object_id
    and f.state ->> 'hypothesis_id' = p_based_on_record_id::text
    and p_based_on_record_id::text = any(f.relation_ids);

  if v_feedback_count <> cardinality(p_feedback_record_ids) then
    raise exception 'feedback_scope_or_link_mismatch' using errcode = '42501';
  end if;

  insert into public.zhi_cognition_revision_proposals (
    owner_user_id, agent_id, target_object_type, target_object_id,
    based_on_record_id, based_on_version, proposed_state
  ) values (
    p_owner_user_id, p_agent_id, v_base.object_type, v_base.object_id,
    p_based_on_record_id, v_base.version, p_proposed_state
  ) returning * into v_proposal;

  insert into public.zhi_cognition_revision_proposal_feedback (
    proposal_id, owner_user_id, agent_id, feedback_record_id
  )
  select v_proposal.id, p_owner_user_id, p_agent_id, unnest(p_feedback_record_ids);

  return jsonb_build_object(
    'id', v_proposal.id,
    'owner_user_id', v_proposal.owner_user_id,
    'agent_id', v_proposal.agent_id,
    'target_object_type', v_proposal.target_object_type,
    'target_object_id', v_proposal.target_object_id,
    'based_on_record_id', v_proposal.based_on_record_id,
    'based_on_version', v_proposal.based_on_version,
    'proposed_state', v_proposal.proposed_state,
    'status', v_proposal.status,
    'requires_human_review', v_proposal.requires_human_review,
    'created_at', v_proposal.created_at,
    'feedback_record_ids', to_jsonb(p_feedback_record_ids)
  );
end;
$zhi_create_cognition_revision_proposal$;

revoke all on function public.zhi_create_cognition_revision_proposal(uuid,uuid,uuid,uuid[],jsonb) from public, anon, authenticated;
grant execute on function public.zhi_create_cognition_revision_proposal(uuid,uuid,uuid,uuid[],jsonb) to service_role;

commit;
