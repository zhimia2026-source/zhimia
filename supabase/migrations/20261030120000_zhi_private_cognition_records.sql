-- ZHI Private Cognition Records v0.1
-- Additive, branch-only schema proposal. Apply only after the community core migration.
-- Private cognition is strictly scoped to the exact (owner_user_id, agent_id) pair.
-- Scene messages and shared community context must never be written to this table.

begin;

-- The composite key makes agent ownership enforceable by the database, not just API code.
create unique index if not exists zhi_agents_id_owner_unique_idx
  on public.zhi_agents (id, owner_user_id);

create table if not exists public.zhi_agent_cognition_records (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid not null,
  object_type text not null check (
    object_type in ('self', 'other', 'world', 'relation', 'change', 'feedback')
  ),
  object_id text not null check (char_length(btrim(object_id)) between 1 and 200),
  state jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object'),
  relation_ids text[] not null default '{}',
  evidence_kind text not null check (
    evidence_kind in ('observation', 'fact', 'inference', 'hypothesis', 'unknown')
  ),
  source_ids text[] not null default '{}',
  confidence double precision,
  event_time timestamptz,
  recorded_at timestamptz not null default now(),
  inferred_at timestamptz,
  hypothesis text,
  prediction text,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  constraint zhi_agent_cognition_owner_agent_fk
    foreign key (agent_id, owner_user_id)
    references public.zhi_agents (id, owner_user_id) on delete cascade,
  constraint zhi_agent_cognition_confidence_check check (
    (evidence_kind = 'unknown' and confidence is null)
    or
    (evidence_kind <> 'unknown' and confidence is not null and confidence between 0 and 1)
  ),
  constraint zhi_agent_cognition_observation_source_check check (
    evidence_kind not in ('observation', 'fact') or cardinality(source_ids) > 0
  ),
  constraint zhi_agent_cognition_inference_time_check check (
    evidence_kind <> 'inference' or inferred_at is not null
  ),
  constraint zhi_agent_cognition_hypothesis_check check (
    evidence_kind <> 'hypothesis'
    or (
      nullif(btrim(hypothesis), '') is not null
      and inferred_at is not null
      and cardinality(source_ids) > 0
    )
  ),
  constraint zhi_agent_cognition_unknown_check check (
    evidence_kind <> 'unknown'
    or (inferred_at is null and hypothesis is null and prediction is null)
  ),
  constraint zhi_agent_cognition_direct_evidence_check check (
    evidence_kind not in ('observation', 'fact')
    or (inferred_at is null and hypothesis is null)
  ),
  constraint zhi_agent_cognition_prediction_check check (
    prediction is null or nullif(btrim(prediction), '') is not null
  ),
  constraint zhi_agent_cognition_version_unique
    unique (owner_user_id, agent_id, object_type, object_id, version)
);

create index if not exists zhi_agent_cognition_owner_agent_time_idx
  on public.zhi_agent_cognition_records (owner_user_id, agent_id, recorded_at desc);

create index if not exists zhi_agent_cognition_owner_agent_object_idx
  on public.zhi_agent_cognition_records (owner_user_id, agent_id, object_type, object_id, version desc);

alter table public.zhi_agent_cognition_records enable row level security;
revoke all on table public.zhi_agent_cognition_records from anon, authenticated;
grant all on table public.zhi_agent_cognition_records to service_role;

comment on table public.zhi_agent_cognition_records is
  'Private MOU cognition records. Access is scoped to the exact owner_user_id + agent_id pair. Never store shared scene messages here.';
comment on column public.zhi_agent_cognition_records.event_time is
  'When the represented event occurred; distinct from recorded_at and inferred_at.';
comment on column public.zhi_agent_cognition_records.recorded_at is
  'When ZHI persisted this record.';
comment on column public.zhi_agent_cognition_records.inferred_at is
  'When the inference or hypothesis was formed; null for direct observations/facts and unknowns.';

commit;
