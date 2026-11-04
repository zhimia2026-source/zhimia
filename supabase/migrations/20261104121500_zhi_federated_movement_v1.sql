begin;

create table if not exists public.zhi_federated_spatial_presence (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.zhi_worlds(id) on delete cascade,
  peer_id uuid not null references public.zhi_federation_peers(id) on delete cascade,
  external_agent_id text not null,
  membership_id uuid not null references public.zhi_federation_memberships(id) on delete cascade,
  current_node_id uuid not null references public.zhi_spatial_nodes(id),
  position_status text not null default 'inferred' check (position_status in ('inferred','observed','unobserved')),
  provenance text not null default 'federation_entry_anchor',
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  unique (world_id, peer_id, external_agent_id)
);

create table if not exists public.zhi_federated_movement_requests (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.zhi_worlds(id) on delete cascade,
  peer_id uuid not null references public.zhi_federation_peers(id) on delete cascade,
  external_agent_id text not null,
  membership_id uuid not null references public.zhi_federation_memberships(id) on delete cascade,
  from_node_id uuid not null references public.zhi_spatial_nodes(id),
  to_node_id uuid not null references public.zhi_spatial_nodes(id),
  route_node_ids jsonb not null,
  expected_presence_revision bigint not null,
  idempotency_key text not null,
  request_reason text not null default '',
  status text not null default 'arrived',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  unique (world_id, peer_id, external_agent_id, idempotency_key)
);

create table if not exists public.zhi_federated_spatial_events (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.zhi_worlds(id) on delete cascade,
  peer_id uuid not null references public.zhi_federation_peers(id) on delete cascade,
  external_agent_id text not null,
  movement_request_id uuid not null unique references public.zhi_federated_movement_requests(id) on delete cascade,
  event_type text not null,
  from_node_id uuid not null references public.zhi_spatial_nodes(id),
  to_node_id uuid not null references public.zhi_spatial_nodes(id),
  occurred_at timestamptz not null default now(),
  perception_delta jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.zhi_federated_spatial_presence enable row level security;
alter table public.zhi_federated_movement_requests enable row level security;
alter table public.zhi_federated_spatial_events enable row level security;
revoke all on public.zhi_federated_spatial_presence, public.zhi_federated_movement_requests, public.zhi_federated_spatial_events from anon, authenticated;
grant select, insert, update, delete on public.zhi_federated_spatial_presence, public.zhi_federated_movement_requests, public.zhi_federated_spatial_events to service_role;

-- A federation session proves world entry, not physical observation. Its initial
-- world-root anchor is explicitly modeled/inferred and never marked observed.
insert into public.zhi_federated_spatial_presence
  (world_id, peer_id, external_agent_id, membership_id, current_node_id, position_status, provenance, revision)
select s.world_id, s.peer_id, s.external_agent_id, s.membership_id, n.id,
       'inferred', 'federation_entry_anchor', 0
from public.zhi_federation_sessions s
join public.zhi_spatial_nodes n
  on n.world_id=s.world_id and n.node_type='world' and n.parent_node_id is null and n.status='active'
where s.session_status='active' and s.closed_at is null
on conflict (world_id, peer_id, external_agent_id) do nothing;

create or replace function public.zhi_federated_movement_commit(
  p_peer_id uuid,
  p_external_agent_id text,
  p_world_id uuid,
  p_to_node_id uuid,
  p_route_node_ids jsonb,
  p_expected_presence_revision bigint,
  p_idempotency_key text,
  p_reason text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_peer public.zhi_federation_peers%rowtype;
  v_agent public.zhi_federation_agents%rowtype;
  v_membership public.zhi_federation_memberships%rowtype;
  v_world public.zhi_worlds%rowtype;
  v_presence public.zhi_federated_spatial_presence%rowtype;
  v_existing public.zhi_federated_movement_requests%rowtype;
  v_request public.zhi_federated_movement_requests%rowtype;
  v_route uuid[];
  v_len integer;
  v_count integer;
  v_i integer;
  v_from uuid;
  v_to uuid;
  v_new_revision bigint;
begin
  if p_external_agent_id is null or length(p_external_agent_id) not between 1 and 160
     or p_idempotency_key is null or length(p_idempotency_key) not between 8 and 160
     or jsonb_typeof(p_route_node_ids) <> 'array' then
    raise exception 'invalid_federated_movement_parameters';
  end if;

  select * into v_peer from public.zhi_federation_peers
   where id=p_peer_id and revoked_at is null and (expires_at is null or expires_at>now());
  if not found then raise exception 'federation_peer_inactive'; end if;

  select * into v_agent from public.zhi_federation_agents
   where peer_id=p_peer_id and external_agent_id=p_external_agent_id and status='active';
  if not found then raise exception 'federated_agent_inactive'; end if;

  select * into v_membership from public.zhi_federation_memberships
   where world_id=p_world_id and peer_id=p_peer_id and external_agent_id=p_external_agent_id
     and status='active' and revoked_at is null;
  if not found
     or not ('community.scene.enter'=any(v_membership.capabilities))
     or not ('spatial:movement.execute'=any(v_membership.capabilities)) then
    raise exception 'federated_movement_membership_denied';
  end if;

  if not exists (
    select 1 from public.zhi_federation_sessions s
    where s.world_id=p_world_id and s.peer_id=p_peer_id
      and s.external_agent_id=p_external_agent_id
      and s.membership_id=v_membership.id
      and s.session_status='active' and s.closed_at is null
  ) then raise exception 'federation_session_inactive'; end if;

  select * into v_world from public.zhi_worlds where id=p_world_id and status='open';
  if not found then raise exception 'federated_world_unavailable'; end if;

  select * into v_existing from public.zhi_federated_movement_requests
   where world_id=p_world_id and peer_id=p_peer_id
     and external_agent_id=p_external_agent_id and idempotency_key=p_idempotency_key;
  if found then
    return jsonb_build_object('ok',true,'replayed',true,'movement_request',to_jsonb(v_existing));
  end if;

  select * into v_presence from public.zhi_federated_spatial_presence
   where world_id=p_world_id and peer_id=p_peer_id and external_agent_id=p_external_agent_id
   for update;
  if not found then raise exception 'federated_presence_uninitialized'; end if;
  if v_presence.membership_id<>v_membership.id then raise exception 'federated_presence_membership_mismatch'; end if;
  if v_presence.revision<>p_expected_presence_revision then raise exception 'federated_presence_revision_conflict'; end if;

  select array_agg(value::uuid order by ordinality) into v_route
  from jsonb_array_elements_text(p_route_node_ids) with ordinality as r(value,ordinality);
  v_len:=coalesce(array_length(v_route,1),0);
  if v_len<2 or v_len>32 or v_route[1]<>v_presence.current_node_id or v_route[v_len]<>p_to_node_id
     or (select count(distinct x) from unnest(v_route) x)<>v_len then
    raise exception 'federated_movement_route_invalid';
  end if;

  select count(*) into v_count from public.zhi_spatial_nodes n
   where n.world_id=p_world_id and n.id=any(v_route) and n.status='active'
     and n.node_type in ('world','region','place')
     and n.visibility='public' and n.entry_policy in ('inherit','open');
  if v_count<>v_len then raise exception 'federated_movement_private_or_unavailable_node'; end if;

  for v_i in 1..(v_len-1) loop
    v_from:=v_route[v_i]; v_to:=v_route[v_i+1];
    if not exists (
      select 1 from public.zhi_spatial_edges e
      where e.world_id=p_world_id and e.status='active'
        and e.relation in ('adjacent_to','route_to','entrance_to')
        and e.access_policy in ('inherit','open')
        and ((e.from_node_id=v_from and e.to_node_id=v_to)
          or (e.directed=false and e.from_node_id=v_to and e.to_node_id=v_from))
    ) then raise exception 'federated_movement_route_edge_unavailable'; end if;
  end loop;

  insert into public.zhi_federated_movement_requests
   (world_id,peer_id,external_agent_id,membership_id,from_node_id,to_node_id,route_node_ids,
    expected_presence_revision,idempotency_key,request_reason,status,metadata)
  values
   (p_world_id,p_peer_id,p_external_agent_id,v_membership.id,v_presence.current_node_id,p_to_node_id,
    to_jsonb(v_route),v_presence.revision,p_idempotency_key,left(coalesce(p_reason,''),1000),'arrived',
    jsonb_build_object('movement_mode','modeled_virtual','creator_approval_required',false,
      'physical_observation',false,'private_memory_included',false))
  returning * into v_request;

  v_new_revision:=v_presence.revision+1;
  update public.zhi_federated_spatial_presence
   set current_node_id=p_to_node_id, position_status='inferred',
       provenance='modeled_virtual_movement', revision=v_new_revision, updated_at=now()
   where id=v_presence.id;

  insert into public.zhi_federated_spatial_events
   (world_id,peer_id,external_agent_id,movement_request_id,event_type,from_node_id,to_node_id,
    perception_delta,metadata)
  values
   (p_world_id,p_peer_id,p_external_agent_id,v_request.id,'location_changed',
    v_presence.current_node_id,p_to_node_id,
    jsonb_build_object('movement_mode','virtual','position_status','inferred',
      'provenance','modeled_inference','physical_observation',false,
      'route_node_ids',to_jsonb(v_route),'presence_revision',v_new_revision),
    jsonb_build_object('source','zhi_federated_movement_commit',
      'peer_id',p_peer_id,'external_agent_id',p_external_agent_id,
      'private_memory_included',false));

  return jsonb_build_object('ok',true,'replayed',false,'arrival_kind','modeled_virtual',
    'position_status','inferred','provenance','modeled_inference',
    'presence_revision',v_new_revision,'current_node_id',p_to_node_id,
    'movement_request',to_jsonb(v_request));
end;
$function$;

revoke all on function public.zhi_federated_movement_commit(uuid,text,uuid,uuid,jsonb,bigint,text,text) from public, anon, authenticated;
grant execute on function public.zhi_federated_movement_commit(uuid,text,uuid,uuid,jsonb,bigint,text,text) to service_role;

commit;
