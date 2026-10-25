-- Minimal per-user request counters, independent of chat-storage consent.
create table public.zhi_health_rate_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, request_id)
);
create index zhi_health_rate_events_user_time_idx
  on public.zhi_health_rate_events (user_id, created_at desc);
alter table public.zhi_health_rate_events enable row level security;
revoke all on public.zhi_health_rate_events from anon, authenticated;
comment on table public.zhi_health_rate_events is
  'Minimal rate-limit metadata only; no message content or health details.';
