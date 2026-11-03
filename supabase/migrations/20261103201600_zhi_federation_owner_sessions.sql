create table if not exists public.zhi_federation_sessions (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.zhi_worlds(id) on delete cascade,
  peer_id uuid not null references public.zhi_federation_peers(id) on delete cascade,
  external_agent_id text not null,
  membership_id uuid not null references public.zhi_federation_memberships(id) on delete cascade,
  session_status text not null default 'active' check (session_status in ('active','closed','expired')),
  position_status text not null default 'unobserved' check (position_status in ('unobserved','anchored','moving')),
  entry_request_id text not null,
  entered_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  closed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint zhi_federation_sessions_entry_request_unique unique (peer_id, external_agent_id, world_id, entry_request_id)
);
create index if not exists zhi_federation_sessions_active_lookup on public.zhi_federation_sessions (peer_id, external_agent_id, world_id, last_seen_at desc) where session_status = 'active';
alter table public.zhi_federation_sessions enable row level security;
revoke all on public.zhi_federation_sessions from anon, authenticated;
grant all on public.zhi_federation_sessions to service_role;