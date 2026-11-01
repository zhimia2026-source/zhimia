-- ZHI CareState persistence for the existing authenticated identity model.
-- Client roles intentionally receive no direct table access; access is mediated by a
-- server-side Edge Function that validates the bearer token and scopes by auth user id.

create table if not exists public.zhi_care_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  care_id text not null check (char_length(care_id) between 1 and 200),
  target_ref text not null check (char_length(target_ref) between 1 and 200),
  care_focus text[] not null default '{}',
  epistemic_status text not null default 'unknown'
    check (epistemic_status in ('observed','reported','verified','inferred','hypothesis','unknown','conflicted')),
  evidence_refs jsonb not null default '[]'::jsonb
    check (jsonb_typeof(evidence_refs) = 'array'),
  uncertainties text[] not null default '{}',
  target_preference text not null default 'unknown'
    check (char_length(target_preference) <= 200),
  relationship_context_ref text,
  goal_refs text[] not null default '{}',
  proposed_action_refs text[] not null default '{}',
  feedback_refs text[] not null default '{}',
  state text not null default 'discovered'
    check (state in ('discovered','understanding','goal_set','action_review','in_progress','feedback_review','waiting_for_response','paused','conflict','resolved','terminated')),
  access_policy text not null default 'private' check (access_policy = 'private'),
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, care_id)
);

create index if not exists zhi_care_states_user_updated_idx
  on public.zhi_care_states (user_id, updated_at desc);

create table if not exists public.zhi_care_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  care_id text not null,
  event_type text not null
    check (event_type in ('created','evidence_added','state_transition','action_proposed','action_approved','action_rejected','feedback_recorded','conflict_detected','paused','terminated')),
  from_state text,
  to_state text,
  revision integer not null check (revision >= 1),
  reason_code text not null check (char_length(reason_code) between 1 and 120),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint zhi_care_events_owner_record_fk
    foreign key (user_id, care_id)
    references public.zhi_care_states(user_id, care_id)
    on delete cascade
);

create index if not exists zhi_care_events_owner_record_time_idx
  on public.zhi_care_events (user_id, care_id, created_at desc);

alter table public.zhi_care_states enable row level security;
alter table public.zhi_care_events enable row level security;

-- Deliberately no policies for anon/authenticated. The service-role Edge Function
-- verifies the user's session and scopes every query by user_id. Do not add broad
-- client policies to silence RLS advisor warnings.
revoke all on table public.zhi_care_states from anon, authenticated;
revoke all on table public.zhi_care_events from anon, authenticated;
grant all on table public.zhi_care_states to service_role;
grant all on table public.zhi_care_events to service_role;

comment on table public.zhi_care_states is
  'Private ZHI CareState records. Access only through server-side authenticated and owner-scoped operations; evidence_refs stores references, not sensitive source text.';
comment on table public.zhi_care_events is
  'Minimal event trail for private ZHI CareState transitions. metadata must not contain message bodies or sensitive source text.';
