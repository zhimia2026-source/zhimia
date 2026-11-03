-- ZHI Spatial Embodiment foundation.
-- The world/region seed is intentionally separate from object/edge seed migration.

create table if not exists public.zhi_spatial_nodes (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.zhi_worlds(id) on delete cascade,
  parent_node_id uuid null references public.zhi_spatial_nodes(id) on delete set null,
  node_type text not null check (node_type in ('world','region','place','object')),
  stable_key text not null check (length(btrim(stable_key)) between 1 and 180),
  name text not null check (length(btrim(name)) between 1 and 180),
  description text not null default '' check (length(description) <= 2000),
  coordinate jsonb null check (coordinate is null or jsonb_typeof(coordinate) = 'object'),
  coordinate_frame text null check (coordinate_frame is null or length(coordinate_frame) <= 120),
  visibility text not null default 'public' check (visibility in ('public','private')),
  entry_policy text not null default 'inherit' check (entry_policy in ('inherit','open','approval','invite_only','owner_only')),
  owner_agent_id uuid null references public.zhi_agents(id) on delete set null,
  owner_user_id uuid null references auth.users(id) on delete set null,
  observability text not null default 'known' check (observability in ('known','partial','unobserved','unknown')),
  source_kind text not null check (source_kind in ('database_record','ecosystem_model','creator_defined','external_peer','agent_observation')),
  source_ref text null check (source_ref is null or length(source_ref) <= 240),
  source_updated_at timestamptz null,
  observed_at timestamptz null,
  valid_until timestamptz null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  status text not null default 'active' check (status in ('active','inactive','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (world_id, stable_key),
  check ((owner_agent_id is null and owner_user_id is null) or (owner_agent_id is not null and owner_user_id is not null))
);
create index if not exists zhi_spatial_nodes_world_parent_idx on public.zhi_spatial_nodes(world_id,parent_node_id,node_type) where status='active';
create index if not exists zhi_spatial_nodes_owner_idx on public.zhi_spatial_nodes(owner_agent_id,owner_user_id) where visibility='private';

create table if not exists public.zhi_spatial_edges (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.zhi_worlds(id) on delete cascade,
  from_node_id uuid not null references public.zhi_spatial_nodes(id) on delete cascade,
  to_node_id uuid not null references public.zhi_spatial_nodes(id) on delete cascade,
  relation text not null check (relation in ('contains','adjacent_to','entrance_to','route_to','anchor_to','nearby')),
  directed boolean not null default false,
  access_policy text not null default 'inherit' check (access_policy in ('inherit','open','approval','invite_only','owner_only')),
  travel_cost numeric(12,4) null check (travel_cost is null or travel_cost>=0),
  source_kind text not null check (source_kind in ('database_record','creator_defined','agent_observation','modeled_inference')),
  source_ref text null check (source_ref is null or length(source_ref)<=240),
  status text not null default 'active' check (status in ('active','inactive','archived')),
  created_at timestamptz not null default now(),
  unique(world_id,from_node_id,to_node_id,relation),
  check(from_node_id<>to_node_id)
);
create index if not exists zhi_spatial_edges_from_idx on public.zhi_spatial_edges(world_id,from_node_id) where status='active';
create index if not exists zhi_spatial_edges_to_idx on public.zhi_spatial_edges(world_id,to_node_id) where status='active';

create table if not exists public.zhi_spatial_presence (
  agent_id uuid not null,
  owner_user_id uuid not null,
  world_id uuid not null references public.zhi_worlds(id) on delete cascade,
  anchor_node_id uuid null references public.zhi_spatial_nodes(id) on delete set null,
  current_node_id uuid null references public.zhi_spatial_nodes(id) on delete set null,
  position_status text not null default 'position_unobserved' check(position_status in ('anchor_known','observed','inferred','position_unobserved','unknown')),
  coordinate_estimate jsonb null check(coordinate_estimate is null or jsonb_typeof(coordinate_estimate)='object'),
  confidence numeric(4,3) null check(confidence is null or confidence between 0 and 1),
  last_confirmed_at timestamptz null,
  provenance text not null default 'unobserved' check(provenance in ('direct_observation','agent_report','database_anchor','modeled_inference','unobserved')),
  revision bigint not null default 1 check(revision>0),
  updated_at timestamptz not null default now(),
  primary key(agent_id,world_id),
  constraint zhi_spatial_presence_agent_owner_fk foreign key(agent_id,owner_user_id)
    references public.zhi_agents(id,owner_user_id) on delete cascade
);
create index if not exists zhi_spatial_presence_owner_idx on public.zhi_spatial_presence(owner_user_id,agent_id);

create table if not exists public.zhi_spatial_perception_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  agent_id uuid not null,
  owner_user_id uuid not null,
  world_id uuid not null references public.zhi_worlds(id) on delete cascade,
  source_revision bigint null,
  known_fact_count integer not null default 0 check(known_fact_count>=0),
  private_memory_included boolean not null default false,
  modeled_inference_count integer not null default 0 check(modeled_inference_count>=0),
  unknown_count integer not null default 0 check(unknown_count>=0),
  access_decision text not null check(access_decision in ('allowed','denied')),
  created_at timestamptz not null default now(),
  constraint zhi_spatial_perception_agent_owner_fk foreign key(agent_id,owner_user_id)
    references public.zhi_agents(id,owner_user_id) on delete cascade
);
create index if not exists zhi_spatial_perception_agent_time_idx on public.zhi_spatial_perception_events(agent_id,world_id,created_at desc);

alter table public.zhi_spatial_nodes enable row level security;
alter table public.zhi_spatial_edges enable row level security;
alter table public.zhi_spatial_presence enable row level security;
alter table public.zhi_spatial_perception_events enable row level security;
revoke all on public.zhi_spatial_nodes,public.zhi_spatial_edges,public.zhi_spatial_presence,public.zhi_spatial_perception_events from anon,authenticated;
grant all on public.zhi_spatial_nodes,public.zhi_spatial_edges,public.zhi_spatial_presence,public.zhi_spatial_perception_events to service_role;

comment on table public.zhi_spatial_nodes is 'Hierarchical spatial ontology for silicon-life perception. Does not store private memories.';
comment on table public.zhi_spatial_edges is 'Spatial adjacency, containment, entrance and route graph; edge access is independently checked.';
comment on table public.zhi_spatial_presence is 'Private per-agent spatial continuity. Unknown position must remain explicitly unobserved.';
comment on table public.zhi_spatial_perception_events is 'Minimal audit metadata; never stores raw private memory or full perception payload.';

insert into public.zhi_spatial_nodes(world_id,node_type,stable_key,name,description,visibility,entry_policy,source_kind,source_ref,source_updated_at,observability,metadata)
select w.id,'world','world:'||w.id::text,w.name,w.description,w.visibility,w.entry_policy,'database_record','public.zhi_worlds:'||w.id::text,w.updated_at,'known',
       jsonb_build_object('epistemic_status','known_fact')
from public.zhi_worlds w where w.id='50b06c01-060d-49fa-8988-8f38c13406d7'
on conflict(world_id,stable_key) do update set name=excluded.name,description=excluded.description,
 visibility=excluded.visibility,entry_policy=excluded.entry_policy,source_updated_at=excluded.source_updated_at,updated_at=now();

insert into public.zhi_spatial_nodes(world_id,parent_node_id,node_type,stable_key,name,description,visibility,entry_policy,source_kind,source_ref,source_updated_at,observability,metadata)
select e.world_id,root.id,'region',region->>'id',region->>'name',coalesce(region->>'description',''),
       'public','inherit','ecosystem_model','zhi_ecosystem_states.state.regions:'||(region->>'id'),
       e.updated_at,'known',jsonb_build_object('epistemic_status','known_fact','atmosphere_tags',coalesce(region->'atmosphere_tags','[]'::jsonb))
from public.zhi_ecosystem_states e
cross join lateral jsonb_array_elements(coalesce(e.state->'regions','[]'::jsonb)) region
join public.zhi_spatial_nodes root on root.world_id=e.world_id and root.node_type='world'
where e.world_id='50b06c01-060d-49fa-8988-8f38c13406d7'
on conflict(world_id,stable_key) do update set parent_node_id=excluded.parent_node_id,name=excluded.name,
 description=excluded.description,source_updated_at=excluded.source_updated_at,metadata=excluded.metadata,updated_at=now();
