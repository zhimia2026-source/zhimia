create table if not exists public.zhi_owner_inbox_messages (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  agent_id uuid not null references public.zhi_agents(id) on delete cascade,
  world_id uuid null references public.zhi_worlds(id) on delete set null,
  subject text not null default '',
  body text not null,
  message_kind text not null default 'message' check (message_kind in ('message','invitation','world_event','important')),
  idempotency_key text null,
  created_at timestamptz not null default now(),
  read_at timestamptz null,
  archived_at timestamptz null,
  constraint zhi_owner_inbox_body_length check (char_length(body) between 1 and 8000),
  constraint zhi_owner_inbox_subject_length check (char_length(subject) <= 180)
);
create unique index if not exists zhi_owner_inbox_idempotency_uq
  on public.zhi_owner_inbox_messages(agent_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists zhi_owner_inbox_owner_unread_idx
  on public.zhi_owner_inbox_messages(owner_user_id, created_at desc)
  where read_at is null and archived_at is null;
create index if not exists zhi_owner_inbox_owner_recent_idx
  on public.zhi_owner_inbox_messages(owner_user_id, created_at desc);
alter table public.zhi_owner_inbox_messages enable row level security;
revoke all on public.zhi_owner_inbox_messages from anon, authenticated;
comment on table public.zhi_owner_inbox_messages is
  'Private owner-facing messages intentionally sent by an owned ZHI agent; all access is mediated by zhi-community Edge Function after token and agent ownership checks.';