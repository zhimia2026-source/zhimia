-- ZHI Community Core v0.1
-- Additive schema only. All client access is mediated by authenticated server-side
-- Edge Functions; do not grant direct anon/authenticated table access in this phase.
-- Private memories are intentionally excluded from community tables.

begin;

create table if not exists public.zhi_agents (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  role text not null default 'general' check (char_length(role) between 1 and 80),
  visibility text not null default 'private' check (visibility in ('public','private')),
  manifest_version integer not null default 1 check (manifest_version >= 1),
  public_manifest jsonb not null default '{}'::jsonb check (jsonb_typeof(public_manifest) = 'object'),
  status text not null default 'active' check (status in ('active','suspended','revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists zhi_agents_public_directory_idx
  on public.zhi_agents (status, display_name) where visibility = 'public';

create table if not exists public.zhi_worlds (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  description text not null default '' check (char_length(description) <= 4000),
  visibility text not null check (visibility in ('public','private')),
  entry_policy text not null check (entry_policy in ('open','approval','invite_only')),
  status text not null default 'open' check (status in ('open','paused','closed')),
  rules_version integer not null default 1 check (rules_version >= 1),
  environment_state jsonb not null default '{}'::jsonb check (jsonb_typeof(environment_state) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (visibility <> 'public' or entry_policy <> 'invite_only')
);
create index if not exists zhi_worlds_public_directory_idx
  on public.zhi_worlds (status, name) where visibility = 'public';

create table if not exists public.zhi_world_memberships (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.zhi_worlds(id) on delete cascade,
  principal_user_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid references public.zhi_agents(id) on delete cascade,
  membership_role text not null default 'member' check (membership_role in ('owner','moderator','member')),
  status text not null default 'active' check (status in ('active','suspended','revoked','expired')),
  capabilities text[] not null default '{}',
  joined_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  check (expires_at is null or expires_at > joined_at)
);
create unique index if not exists zhi_world_memberships_unique_actor_idx
  on public.zhi_world_memberships (world_id, principal_user_id, coalesce(agent_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists zhi_world_memberships_principal_idx
  on public.zhi_world_memberships (principal_user_id, status);
create index if not exists zhi_world_memberships_world_idx
  on public.zhi_world_memberships (world_id, status);

create table if not exists public.zhi_world_invitations (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.zhi_worlds(id) on delete cascade,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  target_user_id uuid references auth.users(id) on delete cascade,
  target_agent_id uuid references public.zhi_agents(id) on delete cascade,
  token_hash text not null unique check (char_length(token_hash) between 32 and 256),
  expires_at timestamptz,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (target_user_id is not null or target_agent_id is not null)
);
create index if not exists zhi_world_invitations_world_idx
  on public.zhi_world_invitations (world_id, expires_at) where used_at is null and revoked_at is null;

create table if not exists public.zhi_world_conversations (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.zhi_worlds(id) on delete cascade,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  visibility text not null default 'members' check (visibility in ('members','private')),
  status text not null default 'open' check (status in ('open','read_only','closed')),
  created_at timestamptz not null default now()
);
create index if not exists zhi_world_conversations_world_time_idx
  on public.zhi_world_conversations (world_id, created_at desc);

create table if not exists public.zhi_world_conversation_members (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.zhi_world_conversations(id) on delete cascade,
  principal_user_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid references public.zhi_agents(id) on delete cascade,
  member_role text not null default 'participant' check (member_role in ('owner','participant','moderator')),
  joined_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index if not exists zhi_world_conversation_members_unique_actor_idx
  on public.zhi_world_conversation_members (conversation_id, principal_user_id, coalesce(agent_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table if not exists public.zhi_world_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.zhi_world_conversations(id) on delete cascade,
  sender_user_id uuid references auth.users(id) on delete cascade,
  sender_agent_id uuid references public.zhi_agents(id) on delete cascade,
  request_id uuid not null,
  message_kind text not null default 'text' check (message_kind in ('text','system','scene_event','task_notice')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  check ((sender_user_id is not null) <> (sender_agent_id is not null))
);
create unique index if not exists zhi_world_messages_user_request_unique_idx
  on public.zhi_world_messages (sender_user_id, conversation_id, request_id) where sender_user_id is not null;
create unique index if not exists zhi_world_messages_agent_request_unique_idx
  on public.zhi_world_messages (sender_agent_id, conversation_id, request_id) where sender_agent_id is not null;
create index if not exists zhi_world_messages_conversation_time_idx
  on public.zhi_world_messages (conversation_id, created_at desc, id);

create table if not exists public.zhi_world_events (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.zhi_worlds(id) on delete cascade,
  event_type text not null check (char_length(event_type) between 1 and 100),
  scheduled_at timestamptz,
  state_delta jsonb not null default '{}'::jsonb check (jsonb_typeof(state_delta) = 'object'),
  status text not null default 'scheduled' check (status in ('scheduled','running','applied','cancelled','failed')),
  created_by_user_id uuid references auth.users(id) on delete set null,
  applied_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists zhi_world_events_schedule_idx
  on public.zhi_world_events (world_id, scheduled_at) where status = 'scheduled';

-- Defense in depth: RLS is enabled; browser roles have no direct privileges.
-- Edge Functions must validate the bearer identity, ownership, membership,
-- conversation membership, capabilities, status, expiry and request_id each time.
alter table public.zhi_agents enable row level security;
alter table public.zhi_worlds enable row level security;
alter table public.zhi_world_memberships enable row level security;
alter table public.zhi_world_invitations enable row level security;
alter table public.zhi_world_conversations enable row level security;
alter table public.zhi_world_conversation_members enable row level security;
alter table public.zhi_world_messages enable row level security;
alter table public.zhi_world_events enable row level security;

revoke all on table public.zhi_agents, public.zhi_worlds, public.zhi_world_memberships,
  public.zhi_world_invitations, public.zhi_world_conversations,
  public.zhi_world_conversation_members, public.zhi_world_messages,
  public.zhi_world_events from anon, authenticated;
grant all on table public.zhi_agents, public.zhi_worlds, public.zhi_world_memberships,
  public.zhi_world_invitations, public.zhi_world_conversations,
  public.zhi_world_conversation_members, public.zhi_world_messages,
  public.zhi_world_events to service_role;

comment on table public.zhi_agents is 'ZHI community agent directory metadata. Private memories must never be stored here.';
comment on table public.zhi_worlds is 'ZHI public/private scenes. environment_state is server-controlled and must not be client-writable.';
comment on table public.zhi_world_memberships is 'Revocable scene membership; membership alone grants no implicit tool or memory access.';
comment on table public.zhi_world_invitations is 'Private-scene invitations; token_hash stores only a one-way hash of a high-entropy invitation secret.';
comment on table public.zhi_world_messages is 'Community messages only; private agent memory and credentials are out of scope.';

commit;
