-- ZHI persistent ecosystem state: append-only event history and periodic snapshots.
-- All three tables are server-only. Public/anon/authenticated access is revoked.
create table if not exists public.zhi_ecosystem_states (
  world_id uuid primary key references public.zhi_worlds(id) on delete restrict,
  revision bigint not null default 0 check (revision >= 0),
  world_time timestamptz not null default now(),
  last_advanced_at timestamptz not null default now(),
  state jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.zhi_ecosystem_events (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.zhi_worlds(id) on delete restrict,
  state_revision bigint not null check (state_revision > 0),
  idempotency_key text not null check (length(idempotency_key) between 1 and 160),
  event_kind text not null check (length(event_kind) between 1 and 80),
  source_kind text not null check (source_kind in ('natural_process','environmental_event','scheduled_event','agent_action','system')),
  occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  causal_chain jsonb not null default '[]'::jsonb check (jsonb_typeof(causal_chain) = 'array'),
  created_at timestamptz not null default now(),
  unique (world_id, idempotency_key)
);

create index if not exists zhi_ecosystem_events_world_time_idx
  on public.zhi_ecosystem_events(world_id, occurred_at desc);
create index if not exists zhi_ecosystem_events_world_revision_idx
  on public.zhi_ecosystem_events(world_id, state_revision desc);

create table if not exists public.zhi_ecosystem_snapshots (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.zhi_worlds(id) on delete restrict,
  revision bigint not null check (revision > 0),
  world_time timestamptz not null,
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  created_at timestamptz not null default now(),
  unique (world_id, revision)
);

create index if not exists zhi_ecosystem_snapshots_world_time_idx
  on public.zhi_ecosystem_snapshots(world_id, world_time desc);

alter table public.zhi_ecosystem_states enable row level security;
alter table public.zhi_ecosystem_events enable row level security;
alter table public.zhi_ecosystem_snapshots enable row level security;

revoke all on public.zhi_ecosystem_states, public.zhi_ecosystem_events, public.zhi_ecosystem_snapshots from public, anon, authenticated;
grant all on public.zhi_ecosystem_states, public.zhi_ecosystem_events, public.zhi_ecosystem_snapshots to service_role;

create or replace function public.zhi_reject_ecosystem_history_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'zhi_ecosystem_history_is_append_only' using errcode = '42501';
end;
$$;

revoke all on function public.zhi_reject_ecosystem_history_mutation() from public, anon, authenticated;

drop trigger if exists zhi_ecosystem_events_append_only on public.zhi_ecosystem_events;
create trigger zhi_ecosystem_events_append_only
before update or delete on public.zhi_ecosystem_events
for each row execute function public.zhi_reject_ecosystem_history_mutation();

drop trigger if exists zhi_ecosystem_snapshots_append_only on public.zhi_ecosystem_snapshots;
create trigger zhi_ecosystem_snapshots_append_only
before update or delete on public.zhi_ecosystem_snapshots
for each row execute function public.zhi_reject_ecosystem_history_mutation();

create or replace function public.zhi_ecosystem_commit_tick(
  p_world_id uuid,
  p_expected_revision bigint,
  p_world_time timestamptz,
  p_state jsonb,
  p_events jsonb default '[]'::jsonb,
  p_force_snapshot boolean default false
)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_current public.zhi_ecosystem_states%rowtype;
  v_next_revision bigint;
  v_event jsonb;
  v_event_count integer := 0;
begin
  if p_world_id is null
     or p_expected_revision is null or p_expected_revision < 0
     or p_world_time is null
     or p_state is null or jsonb_typeof(p_state) <> 'object'
     or p_events is null or jsonb_typeof(p_events) <> 'array'
     or octet_length(p_state::text) > 262144
     or octet_length(p_events::text) > 131072
     or jsonb_array_length(p_events) > 200 then
    raise exception 'invalid_ecosystem_tick_arguments' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.zhi_worlds w
    where w.id = p_world_id and w.status = 'open'
  ) then
    raise exception 'ecosystem_world_not_open' using errcode = 'P0002';
  end if;

  insert into public.zhi_ecosystem_states(world_id, revision, world_time, last_advanced_at, state)
  values (p_world_id, 0, p_world_time, now(), '{}'::jsonb)
  on conflict (world_id) do nothing;

  select * into v_current
  from public.zhi_ecosystem_states
  where world_id = p_world_id
  for update;

  if v_current.revision <> p_expected_revision then
    raise exception 'ecosystem_revision_conflict' using errcode = '40001';
  end if;
  if p_world_time < v_current.world_time then
    raise exception 'ecosystem_world_time_regression' using errcode = '22023';
  end if;

  v_next_revision := v_current.revision + 1;

  update public.zhi_ecosystem_states
  set revision = v_next_revision,
      world_time = p_world_time,
      last_advanced_at = now(),
      state = p_state,
      updated_at = now()
  where world_id = p_world_id;

  for v_event in select value from jsonb_array_elements(p_events)
  loop
    if jsonb_typeof(v_event) <> 'object'
       or coalesce(v_event->>'idempotency_key','') = ''
       or coalesce(v_event->>'event_kind','') = ''
       or coalesce(v_event->>'source_kind','') not in ('natural_process','environmental_event','scheduled_event','agent_action','system')
       or coalesce(v_event->>'occurred_at','') = ''
       or jsonb_typeof(coalesce(v_event->'payload','{}'::jsonb)) <> 'object'
       or jsonb_typeof(coalesce(v_event->'causal_chain','[]'::jsonb)) <> 'array' then
      raise exception 'invalid_ecosystem_event' using errcode = '22023';
    end if;

    insert into public.zhi_ecosystem_events(
      world_id, state_revision, idempotency_key, event_kind, source_kind,
      occurred_at, payload, causal_chain
    ) values (
      p_world_id, v_next_revision, v_event->>'idempotency_key',
      v_event->>'event_kind', v_event->>'source_kind',
      (v_event->>'occurred_at')::timestamptz,
      coalesce(v_event->'payload','{}'::jsonb),
      coalesce(v_event->'causal_chain','[]'::jsonb)
    )
    on conflict (world_id, idempotency_key) do nothing;

    v_event_count := v_event_count + 1;
  end loop;

  if p_force_snapshot or v_next_revision = 1 or mod(v_next_revision, 50) = 0 then
    insert into public.zhi_ecosystem_snapshots(world_id, revision, world_time, state)
    values (p_world_id, v_next_revision, p_world_time, p_state)
    on conflict (world_id, revision) do nothing;
  end if;

  return jsonb_build_object(
    'world_id', p_world_id,
    'revision', v_next_revision,
    'world_time', p_world_time,
    'event_count', v_event_count,
    'snapshot_created', (p_force_snapshot or v_next_revision = 1 or mod(v_next_revision, 50) = 0)
  );
end;
$$;

revoke all on function public.zhi_ecosystem_commit_tick(uuid,bigint,timestamptz,jsonb,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.zhi_ecosystem_commit_tick(uuid,bigint,timestamptz,jsonb,jsonb,boolean) to service_role;
