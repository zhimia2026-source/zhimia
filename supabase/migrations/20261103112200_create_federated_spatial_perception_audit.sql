create table if not exists public.zhi_federated_spatial_perception_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  peer_id uuid not null references public.zhi_federation_peers(id) on delete cascade,
  external_agent_id text not null,
  world_id uuid not null references public.zhi_worlds(id) on delete cascade,
  source_revision bigint null,
  known_fact_count integer not null default 0 check(known_fact_count>=0),
  modeled_inference_count integer not null default 0 check(modeled_inference_count>=0),
  unknown_count integer not null default 0 check(unknown_count>=0),
  access_decision text not null check(access_decision in ('allowed','denied')),
  created_at timestamptz not null default now(),
  constraint zhi_federated_spatial_perception_agent_fk
    foreign key(peer_id,external_agent_id)
    references public.zhi_federation_agents(peer_id,external_agent_id) on delete cascade
);
create index if not exists zhi_federated_spatial_perception_peer_world_idx
  on public.zhi_federated_spatial_perception_events(peer_id,external_agent_id,world_id,created_at desc);
alter table public.zhi_federated_spatial_perception_events enable row level security;
revoke all on public.zhi_federated_spatial_perception_events from anon,authenticated;
grant all on public.zhi_federated_spatial_perception_events to service_role;
comment on table public.zhi_federated_spatial_perception_events is
  'Minimal audit metadata for peer access to public scene spatial perception; never stores the returned payload.';
