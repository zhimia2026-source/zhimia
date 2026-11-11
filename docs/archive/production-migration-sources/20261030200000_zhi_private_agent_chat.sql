-- ZHI private agent chat v0.1
-- Append-only owner/agent private chat turns. This is NOT the shared scene message store.
-- Apply only after zhi_community_core and zhi_private_cognition_records.

begin;

create table if not exists public.zhi_agent_chat_turns (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid not null,
  request_key text not null check (char_length(btrim(request_key)) between 1 and 200),
  user_message text not null check (char_length(btrim(user_message)) between 1 and 8000),
  assistant_message text,
  status text not null default 'pending' check (status in ('pending', 'complete', 'failed')),
  provider_model text,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint zhi_agent_chat_turn_owner_agent_fk
    foreign key (agent_id, owner_user_id)
    references public.zhi_agents (id, owner_user_id) on delete cascade,
  constraint zhi_agent_chat_turn_request_unique
    unique (owner_user_id, agent_id, request_key),
  constraint zhi_agent_chat_turn_completion_check check (
    (status = 'complete' and nullif(btrim(assistant_message), '') is not null and completed_at is not null)
    or
    (status = 'pending' and assistant_message is null and completed_at is null)
    or
    (status = 'failed' and assistant_message is null)
  )
);

create index if not exists zhi_agent_chat_turn_owner_agent_time_idx
  on public.zhi_agent_chat_turns (owner_user_id, agent_id, created_at desc);

alter table public.zhi_agent_chat_turns enable row level security;
revoke all on table public.zhi_agent_chat_turns from anon, authenticated;
grant all on table public.zhi_agent_chat_turns to service_role;

comment on table public.zhi_agent_chat_turns is
  'Private owner-to-agent chat turns scoped to exact owner_user_id + agent_id. Never mix with shared scene messages or another agent private cognition.';

commit;
