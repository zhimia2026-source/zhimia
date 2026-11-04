-- Transactional virtual movement commit.
-- This is modeled world-state movement, not physical arrival evidence.

begin;

create or replace function public.zhi_movement_commit_virtual(
  p_movement_request_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_req public.zhi_movement_requests%rowtype;
  v_presence public.zhi_spatial_presence%rowtype;
  v_route_len integer;
  v_valid_nodes integer;
  v_distinct_nodes integer;
  v_from uuid;
  v_to uuid;
  v_new_revision bigint;
  v_world_status text;
begin
  if p_movement_request_id is null or p_actor_user_id is null then
    raise exception 'invalid_virtual_movement_identity';
  end if;

  select * into v_req
  from public.zhi_movement_requests
  where id = p_movement_request_id
    and owner_user_id = p_actor_user_id
  for update;

  if not found then
    raise exception 'movement_request_not_found';
  end if;

  if v_req.status = 'arrived'
     and v_req.metadata->>'arrival_kind' = 'modeled_virtual' then
    return jsonb_build_object(
      'ok', true, 'replayed', true, 'status', 'arrived',
      'arrival_kind', 'modeled_virtual',
      'movement_request', to_jsonb(v_req)
    );
  end if;

  if v_req.status <> 'executing'
     or v_req.approval_required is distinct from true
     or v_req.approved_by_user_id is distinct from p_actor_user_id then
    raise exception 'movement_not_approved_for_virtual_commit';
  end if;

  if not exists (
    select 1
    from public.zhi_agents a
    where a.id = v_req.agent_id
      and a.owner_user_id = p_actor_user_id
      and a.status = 'active'
  ) then
    raise exception 'movement_agent_not_owned_or_inactive';
  end if;

  select w.status into v_world_status
  from public.zhi_worlds w
  where w.id = v_req.world_id;
  if not found or v_world_status <> 'open' then
    raise exception 'movement_world_not_open';
  end if;

  if not exists (
    select 1
    from public.zhi_world_memberships m
    where m.world_id = v_req.world_id
      and m.agent_id = v_req.agent_id
      and m.principal_user_id = p_actor_user_id
      and m.status = 'active'
      and m.revoked_at is null
      and (m.expires_at is null or m.expires_at > now())
      and m.capabilities @> array['community.scene.enter','spatial:movement.execute']::text[]
  ) then
    raise exception 'movement_capability_required';
  end if;

  if jsonb_typeof(v_req.route_node_ids) <> 'array' then
    raise exception 'movement_route_invalid';
  end if;
  v_route_len := jsonb_array_length(v_req.route_node_ids);
  if v_route_len < 2 or v_route_len > 32 then
    raise exception 'movement_route_invalid';
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(v_req.route_node_ids) as r(node_id)
    where r.node_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) then
    raise exception 'movement_route_invalid';
  end if;

  if (v_req.route_node_ids->>0)::uuid is distinct from v_req.from_node_id
     or (v_req.route_node_ids->>(v_route_len-1))::uuid is distinct from v_req.to_node_id then
    raise exception 'movement_route_endpoints_invalid';
  end if;

  select count(*), count(distinct r.node_id)
    into v_valid_nodes, v_distinct_nodes
  from jsonb_array_elements_text(v_req.route_node_ids) as r(node_id)
  join public.zhi_spatial_nodes n on n.id = r.node_id::uuid
  where n.world_id = v_req.world_id
    and n.status = 'active'
    and n.node_type in ('world','region','place')
    and n.visibility = 'public'
    and n.entry_policy in ('inherit','open');

  if v_valid_nodes <> v_route_len or v_distinct_nodes <> v_route_len then
    raise exception 'movement_route_contains_unavailable_node';
  end if;

  for i in 0..(v_route_len-2) loop
    v_from := (v_req.route_node_ids->>i)::uuid;
    v_to := (v_req.route_node_ids->>(i+1))::uuid;
    if not exists (
      select 1
      from public.zhi_spatial_edges e
      where e.world_id = v_req.world_id
        and e.status = 'active'
        and e.relation in ('adjacent_to','route_to','entrance_to')
        and e.access_policy in ('inherit','open')
        and (
          (e.from_node_id = v_from and e.to_node_id = v_to)
          or (e.directed = false and e.from_node_id = v_to and e.to_node_id = v_from)
        )
    ) then
      raise exception 'movement_route_edge_unavailable';
    end if;
  end loop;

  select * into v_presence
  from public.zhi_spatial_presence
  where agent_id = v_req.agent_id
    and owner_user_id = p_actor_user_id
    and world_id = v_req.world_id
  for update;

  if not found
     or v_presence.current_node_id is distinct from v_req.from_node_id
     or v_presence.revision is distinct from v_req.expected_presence_revision
     or v_presence.position_status not in ('anchor_known','observed','inferred') then
    raise exception 'presence_revision_or_origin_conflict';
  end if;

  v_new_revision := v_presence.revision + 1;

  update public.zhi_spatial_presence
  set current_node_id = v_req.to_node_id,
      position_status = 'inferred',
      coordinate_estimate = null,
      confidence = null,
      last_confirmed_at = null,
      provenance = 'modeled_inference',
      revision = v_new_revision,
      updated_at = now()
  where agent_id = v_req.agent_id
    and owner_user_id = p_actor_user_id
    and world_id = v_req.world_id;

  update public.zhi_movement_requests
  set status = 'arrived',
      completed_at = now(),
      updated_at = now(),
      metadata = metadata || jsonb_build_object(
        'arrival_kind','modeled_virtual',
        'movement_provenance','modeled_inference',
        'physical_observation',false,
        'committed_presence_revision',v_new_revision
      )
  where id = v_req.id
  returning * into v_req;

  insert into public.zhi_spatial_environment_events (
    world_id,agent_id,owner_user_id,movement_request_id,event_type,
    from_node_id,to_node_id,perception_delta,metadata
  ) values (
    v_req.world_id,v_req.agent_id,v_req.owner_user_id,v_req.id,'location_changed',
    v_req.from_node_id,v_req.to_node_id,
    jsonb_build_object(
      'movement_mode','virtual',
      'position_status','inferred',
      'provenance','modeled_inference',
      'physical_observation',false,
      'from_node_id',v_req.from_node_id,
      'to_node_id',v_req.to_node_id,
      'route_node_ids',v_req.route_node_ids,
      'presence_revision',v_new_revision
    ),
    jsonb_build_object(
      'source','modeled_virtual_movement',
      'approved_by_user_id',p_actor_user_id,
      'private_memory_included',false
    )
  );

  return jsonb_build_object(
    'ok',true,'replayed',false,'status','arrived',
    'arrival_kind','modeled_virtual',
    'position_status','inferred',
    'provenance','modeled_inference',
    'presence_revision',v_new_revision,
    'current_node_id',v_req.to_node_id,
    'movement_request',to_jsonb(v_req)
  );
end;
$function$;

revoke all on function public.zhi_movement_commit_virtual(uuid,uuid) from public;
revoke all on function public.zhi_movement_commit_virtual(uuid,uuid) from anon, authenticated;
grant execute on function public.zhi_movement_commit_virtual(uuid,uuid) to service_role;

comment on function public.zhi_movement_commit_virtual(uuid,uuid) is
'Commits an explicitly approved, capability-gated virtual movement as inferred modeled world state. Never creates physical observation evidence.';

commit;
