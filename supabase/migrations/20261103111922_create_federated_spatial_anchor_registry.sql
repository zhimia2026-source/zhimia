create table if not exists public.zhi_federated_spatial_anchors (
  id uuid primary key default gen_random_uuid(),
  peer_id uuid not null references public.zhi_federation_peers(id) on delete cascade,
  external_agent_id text not null,
  external_world_id text not null check (length(btrim(external_world_id)) between 1 and 180),
  external_node_id text not null check (length(btrim(external_node_id)) between 1 and 180),
  stable_key text not null check (length(btrim(stable_key)) between 1 and 180),
  name text not null check (length(btrim(name)) between 1 and 160),
  node_type text not null default 'place' check (node_type in ('world','region','place','object')),
  visibility text not null default 'private' check (visibility in ('public','private')),
  entry_policy text not null default 'owner_only' check (entry_policy in ('open','approval','invite_only','owner_only')),
  observability text not null default 'unobserved' check (observability in ('known','partial','unobserved','unknown')),
  assertion_status text not null default 'peer_asserted' check (assertion_status in ('peer_asserted','challenge_verified','revoked')),
  source_revision text null check (source_revision is null or length(source_revision)<=120),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(peer_id,external_agent_id,external_world_id,external_node_id),
  unique(peer_id,external_agent_id,stable_key),
  constraint zhi_federated_spatial_anchor_agent_fk
    foreign key(peer_id,external_agent_id)
    references public.zhi_federation_agents(peer_id,external_agent_id) on delete cascade
);
create index if not exists zhi_federated_spatial_anchors_peer_agent_idx
  on public.zhi_federated_spatial_anchors(peer_id,external_agent_id,assertion_status);
alter table public.zhi_federated_spatial_anchors enable row level security;
revoke all on public.zhi_federated_spatial_anchors from anon,authenticated;
grant all on public.zhi_federated_spatial_anchors to service_role;
comment on table public.zhi_federated_spatial_anchors is
  'Minimal peer-owned external spatial references. No coordinates, private memory, or detailed remote microstates are mirrored.';
