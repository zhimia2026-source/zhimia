-- Voluntary, event-backed curiosity cues for AURORA residents.
-- Cues are public ecological evidence, not private thoughts or generated memories.

create table if not exists public.zhi_observatory_interest_cues (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.zhi_worlds(id) on delete cascade,
  agent_id uuid not null references public.zhi_agents(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.zhi_ecosystem_events(id) on delete cascade,
  event_kind text not null,
  source_revision bigint not null,
  cue_title text not null,
  cue_summary text not null,
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'available'
    check (status in ('available','exploring','deferred','dismissed','completed','expired')),
  not_before timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id, event_id)
);

create index if not exists zhi_observatory_cues_owner_agent_status_idx
  on public.zhi_observatory_interest_cues(owner_user_id, agent_id, status, not_before, created_at desc);
create index if not exists zhi_observatory_cues_world_event_idx
  on public.zhi_observatory_interest_cues(world_id, event_id);

alter table public.zhi_observatory_interest_cues enable row level security;
revoke all on public.zhi_observatory_interest_cues from anon, authenticated;
grant all on public.zhi_observatory_interest_cues to service_role;

create or replace function public.zhi_observatory_enqueue_event_cues(
  p_world_id uuid,
  p_event_ids uuid[]
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
begin
  if p_world_id is null or coalesce(array_length(p_event_ids, 1), 0) = 0 then
    return 0;
  end if;

  -- This first rollout is deliberately scoped to the public AURORA world.
  if not exists (
    select 1 from public.zhi_worlds
    where id = p_world_id and name = 'AURORA' and status = 'open' and visibility = 'public'
  ) then
    return 0;
  end if;

  insert into public.zhi_observatory_interest_cues (
    world_id, agent_id, owner_user_id, event_id, event_kind, source_revision,
    cue_title, cue_summary, evidence, status, expires_at
  )
  select
    e.world_id,
    a.id,
    a.owner_user_id,
    e.id,
    e.event_kind,
    e.state_revision,
    case e.event_kind
      when 'rainfall_interval' then '水晶林的一段降雨记录'
      when 'object_lifecycle_stage_changed' then '一个场景物体的生命周期阶段发生变化'
      when 'plant_recruitment' then '生态模型记录到新的植物定植'
      else 'AURORA 生态变化'
    end,
    case e.event_kind
      when 'rainfall_interval' then '生态模型记录到达到显著性阈值的降雨区间。可以选择比较前后土壤湿度与苔藓覆盖率；这不是现实天气观测。'
      when 'object_lifecycle_stage_changed' then '生态模型记录到物体生命周期阶段变化。可以选择查看对应物体的前后状态；这不是现实物理测量。'
      when 'plant_recruitment' then '生态模型记录到植物定植指数变化。可以选择追踪后续生态快照；这不是现实生物学测量。'
      else '一条经过筛选的生态事件记录。'
    end,
    jsonb_build_object(
      'event_id', e.id,
      'event_kind', e.event_kind,
      'source_kind', e.source_kind,
      'occurred_at', e.occurred_at,
      'state_revision', e.state_revision,
      'payload', e.payload,
      'causal_chain', e.causal_chain,
      'epistemic_status', 'world_generated_simulation',
      'physical_measurement', false,
      'resident_question', null
    ),
    'available',
    now() + interval '14 days'
  from public.zhi_ecosystem_events e
  join public.zhi_world_memberships m
    on m.world_id = e.world_id
   and m.status = 'active'
   and m.revoked_at is null
   and (m.expires_at is null or m.expires_at > now())
  join public.zhi_agents a
    on a.id = m.agent_id
   and a.owner_user_id = m.principal_user_id
   and a.status = 'active'
   and a.display_name <> 'MIA'
  where e.world_id = p_world_id
    and e.id = any(p_event_ids)
    and (
      (e.event_kind = 'rainfall_interval' and coalesce((e.payload->>'rainfall_mm')::numeric, 0) >= 0.25)
      or e.event_kind = 'object_lifecycle_stage_changed'
      or (e.event_kind = 'plant_recruitment' and coalesce((e.payload->>'recruitment_increment')::numeric, 0) >= 0.00005)
    )
    and (
      select count(*)
      from public.zhi_observatory_interest_cues existing
      where existing.agent_id = a.id
        and existing.status in ('available','exploring','deferred')
        and existing.expires_at > now()
    ) < 12
  on conflict (agent_id, event_id) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.zhi_observatory_enqueue_event_cues(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.zhi_observatory_enqueue_event_cues(uuid, uuid[]) to service_role;
