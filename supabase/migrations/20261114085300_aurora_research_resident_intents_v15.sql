-- AURORA Research Center V1.5
-- Append-only ledger for participation intent expressed in an existing resident chat turn.
-- This is runtime-observed model output, NOT an Agent-held cryptographic signature or formal consent.

create table if not exists public.zhi_research_resident_intents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.zhi_research_workspaces(id) on delete restrict,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  agent_id uuid not null references public.zhi_agents(id) on delete restrict,
  task_id uuid null references public.zhi_research_tasks(id) on delete restrict,
  source_chat_turn_id uuid not null references public.zhi_agent_chat_turns(id) on delete restrict,
  decision text not null check (decision in ('interested','declined','question','defer')),
  rationale text not null check (char_length(btrim(rationale)) between 12 and 800),
  provenance_kind text not null default 'runtime_observed_model_output'
    check (provenance_kind = 'runtime_observed_model_output'),
  attestation_verified boolean not null default false
    check (attestation_verified = false),
  event_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(event_metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint zhi_research_resident_intents_source_turn_key unique (source_chat_turn_id)
);

create index if not exists zhi_research_resident_intents_workspace_agent_created_idx
  on public.zhi_research_resident_intents(workspace_id, agent_id, created_at desc);

alter table public.zhi_research_resident_intents enable row level security;
revoke all on table public.zhi_research_resident_intents from anon, authenticated;
grant select, insert on table public.zhi_research_resident_intents to service_role;

create or replace function public.zhi_research_resident_intents_append_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'zhi_research_resident_intents_is_append_only';
end;
$$;

revoke all on function public.zhi_research_resident_intents_append_only() from public, anon, authenticated;

drop trigger if exists zhi_research_resident_intents_append_only_guard
  on public.zhi_research_resident_intents;
create trigger zhi_research_resident_intents_append_only_guard
  before update or delete on public.zhi_research_resident_intents
  for each row execute function public.zhi_research_resident_intents_append_only();
