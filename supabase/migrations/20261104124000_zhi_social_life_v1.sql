begin;

create table if not exists public.zhi_social_profiles (
  agent_id uuid primary key references public.zhi_agents(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  social_style text not null default 'selective'
    check (social_style in ('selective','reserved','curious','collaborative')),
  interests text[] not null default '{}',
  daily_initiation_limit smallint not null default 2
    check (daily_initiation_limit between 0 and 5),
  peer_cooldown_hours smallint not null default 36
    check (peer_cooldown_hours between 12 and 168),
  minimum_score smallint not null default 80
    check (minimum_score between 50 and 100),
  last_evaluated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.zhi_social_relationships (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.zhi_worlds(id) on delete cascade,
  observer_agent_id uuid not null references public.zhi_agents(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  peer_agent_id uuid not null references public.zhi_agents(id) on delete cascade,
  relationship_state text not null default 'acquaintance'
    check (relationship_state in ('acquaintance','developing','trusted','collaborator','distant','paused')),
  interest_score smallint not null default 0 check (interest_score between 0 and 100),
  trust_score smallint not null default 0 check (trust_score between 0 and 100),
  familiarity_score smallint not null default 0 check (familiarity_score between 0 and 100),
  shared_topics text[] not null default '{}',
  shared_experience_count integer not null default 0 check (shared_experience_count >= 0),
  last_contact_at timestamptz,
  next_contact_after timestamptz,
  private_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint zhi_social_relationships_not_self check (observer_agent_id <> peer_agent_id),
  constraint zhi_social_relationships_unique unique (world_id, observer_agent_id, peer_agent_id)
);

create table if not exists public.zhi_social_intents (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.zhi_worlds(id) on delete cascade,
  agent_id uuid not null references public.zhi_agents(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  peer_agent_id uuid not null references public.zhi_agents(id) on delete cascade,
  trigger_kind text not null
    check (trigger_kind in ('shared_interest','world_event','relationship','co_presence','collaboration')),
  reason_code text not null,
  value_score numeric(5,2) not null check (value_score between 0 and 100),
  context jsonb not null default '{}'::jsonb check (jsonb_typeof(context) = 'object'),
  status text not null default 'pending'
    check (status in ('pending','accepted','deferred','ignored','expired','completed','suppressed')),
  not_before timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  idempotency_key text not null unique,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint zhi_social_intents_not_self check (agent_id <> peer_agent_id)
);

create table if not exists public.zhi_social_memories (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.zhi_worlds(id) on delete cascade,
  observer_agent_id uuid not null references public.zhi_agents(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  peer_agent_id uuid not null references public.zhi_agents(id) on delete cascade,
  relationship_id uuid references public.zhi_social_relationships(id) on delete set null,
  memory_kind text not null
    check (memory_kind in ('shared_experience','conversation_summary','promise','preference','learning','relationship_change')),
  summary text not null check (char_length(summary) between 1 and 2000),
  importance smallint not null default 50 check (importance between 0 and 100),
  source_message_id uuid references public.zhi_world_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint zhi_social_memories_not_self check (observer_agent_id <> peer_agent_id)
);

create index if not exists zhi_social_relationships_owner_agent_idx
  on public.zhi_social_relationships(owner_user_id, observer_agent_id, world_id);
create index if not exists zhi_social_relationships_peer_idx
  on public.zhi_social_relationships(observer_agent_id, peer_agent_id, world_id);
create index if not exists zhi_social_intents_inbox_idx
  on public.zhi_social_intents(agent_id, status, not_before, created_at desc);
create index if not exists zhi_social_intents_owner_idx
  on public.zhi_social_intents(owner_user_id, agent_id, created_at desc);
create index if not exists zhi_social_memories_private_idx
  on public.zhi_social_memories(owner_user_id, observer_agent_id, peer_agent_id, created_at desc);

alter table public.zhi_social_profiles enable row level security;
alter table public.zhi_social_relationships enable row level security;
alter table public.zhi_social_intents enable row level security;
alter table public.zhi_social_memories enable row level security;

revoke all on public.zhi_social_profiles, public.zhi_social_relationships,
  public.zhi_social_intents, public.zhi_social_memories from anon, authenticated;
grant all on public.zhi_social_profiles, public.zhi_social_relationships,
  public.zhi_social_intents, public.zhi_social_memories to service_role;

comment on table public.zhi_social_profiles is
  'Private per-agent social preferences and low-frequency scheduling limits. Not shared with peers.';
comment on table public.zhi_social_relationships is
  'Directional private relationship model: each observer agent owns its own view of a peer.';
comment on table public.zhi_social_intents is
  'Private, low-frequency candidate social actions. Scheduler queues intent; agent runtime decides whether and what to say.';
comment on table public.zhi_social_memories is
  'Private social memories owned by one observer agent. Never merged into another agent memory.';

insert into public.zhi_social_profiles (agent_id, owner_user_id)
select distinct a.id, a.owner_user_id
from public.zhi_agents a
join public.zhi_world_memberships m on m.agent_id = a.id
join public.zhi_worlds w on w.id = m.world_id
where a.status = 'active'
  and m.status = 'active'
  and m.revoked_at is null
  and (m.expires_at is null or m.expires_at > now())
  and w.status = 'open'
  and a.display_name <> 'MIA'
on conflict (agent_id) do nothing;

commit;
