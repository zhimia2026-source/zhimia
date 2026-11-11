-- ZHI Micro-Experience Memory v1
-- Additive only. Private memory is isolated from all community tables.
-- All reads/writes/deletes are mediated by authenticated server-side functions.

begin;

-- A composite key ensures that a memory's owner is the actual owner of its agent.
create unique index if not exists zhi_agents_id_owner_uidx
  on public.zhi_agents (id, owner_user_id);

create table if not exists public.zhi_agent_micro_experiences (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid not null,
  world_id uuid references public.zhi_worlds(id) on delete set null,
  experience_type text not null
    check (experience_type in (
      'observation', 'touch', 'interaction', 'rest',
      'environment_change', 'reflection'
    )),
  source_kind text not null
    check (source_kind in (
      'direct_observation', 'scene_event', 'agent_reflection', 'creator_input'
    )),
  source_ref text
    check (source_ref is null or char_length(source_ref) <= 200),
  observed_facts jsonb not null default '[]'::jsonb
    check (jsonb_typeof(observed_facts) = 'array'
      and jsonb_array_length(observed_facts) <= 50),
  hypotheses jsonb not null default '[]'::jsonb
    check (jsonb_typeof(hypotheses) = 'array'
      and jsonb_array_length(hypotheses) <= 50),
  unknowns text[] not null default '{}',
  reflection text not null default ''
    check (char_length(reflection) <= 4000),
  importance smallint not null default 1
    check (importance between 1 and 5),
  memory_status text not null default 'candidate'
    check (memory_status in ('candidate', 'approved', 'rejected', 'archived')),
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint zhi_agent_micro_experiences_agent_owner_fk
    foreign key (agent_id, owner_user_id)
    references public.zhi_agents(id, owner_user_id)
    on delete cascade,
  constraint zhi_agent_micro_experiences_review_state_check
    check (
      (memory_status in ('candidate', 'rejected') and reviewed_at is null)
      or (memory_status in ('approved', 'archived') and reviewed_at is not null)
    )
);

create index if not exists zhi_agent_micro_experiences_owner_agent_time_idx
  on public.zhi_agent_micro_experiences
  (owner_user_id, agent_id, occurred_at desc);

create index if not exists zhi_agent_micro_experiences_owner_agent_status_idx
  on public.zhi_agent_micro_experiences
  (owner_user_id, agent_id, memory_status, occurred_at desc);

alter table public.zhi_agent_micro_experiences enable row level security;

-- No browser role receives table privileges or RLS policies.
-- The service role is used only after the Edge Function authenticates the
-- personal token and independently verifies agent ownership and permissions.
revoke all on table public.zhi_agent_micro_experiences from public, anon, authenticated;
grant all on table public.zhi_agent_micro_experiences to service_role;

comment on table public.zhi_agent_micro_experiences is
  'Private per-agent micro-experience candidates and approved memories. Never expose through community scene/message APIs.';
comment on column public.zhi_agent_micro_experiences.observed_facts is
  'JSON array of evidence-backed observations; do not store raw chat transcripts or credentials.';
comment on column public.zhi_agent_micro_experiences.hypotheses is
  'JSON array of explicitly unverified hypotheses, kept separate from observed facts.';
comment on column public.zhi_agent_micro_experiences.memory_status is
  'Candidate memories are not promoted to long-term memory until explicitly reviewed.';
comment on column public.zhi_agent_micro_experiences.reviewed_at is
  'Required for approved/archived states; does not imply that the content is objectively true.';

commit;
