-- Creator-approved AURORA public world entrances, V1.
-- Additive and idempotent. No resident presence, coordinates, capabilities, or runtime state are changed.
-- Rollback instructions: docs/world/AURORA_PUBLIC_ENTRANCES_V1.md

begin;

do $$
declare
  v_world_id uuid := '50b06c01-060d-49fa-8988-8f38c13406d7';
  v_root_id uuid := '51d174fb-6091-4447-91e8-99460ce69135';
  v_root_count integer;
  v_region_count integer;
begin
  select count(*) into v_root_count
  from public.zhi_spatial_nodes
  where id = v_root_id
    and world_id = v_world_id
    and node_type = 'world'
    and status = 'active'
    and visibility = 'public'
    and entry_policy in ('open','inherit');

  if v_root_count <> 1 then
    raise exception 'AURORA public entrance migration: expected exactly one active public open world root';
  end if;

  select count(*) into v_region_count
  from public.zhi_spatial_nodes
  where world_id = v_world_id
    and id in (
      '664688d0-4785-432c-93a7-57bf3858f858', -- Crystal Forest
      'c5ad26f8-c94d-49a6-99c0-cef7109a2fa7', -- Living City
      'c970c991-9354-432c-94db-3b8d6cb157f8', -- Memory Valley
      '3cb50429-aa56-405e-9dc5-761fdf757cd3'  -- Ocean of Light
    )
    and node_type = 'region'
    and status = 'active'
    and visibility = 'public'
    and entry_policy in ('open','inherit');

  if v_region_count <> 4 then
    raise exception 'AURORA public entrance migration: all four creator-approved regions must exist and remain public/open';
  end if;
end $$;

insert into public.zhi_spatial_edges
  (world_id, from_node_id, to_node_id, relation, directed, access_policy, source_kind, source_ref, status)
values
  ('50b06c01-060d-49fa-8988-8f38c13406d7','51d174fb-6091-4447-91e8-99460ce69135','664688d0-4785-432c-93a7-57bf3858f858','entrance_to',false,'inherit','modeled_inference','creator-approved:aurora-public-entrances-v1','active'),
  ('50b06c01-060d-49fa-8988-8f38c13406d7','51d174fb-6091-4447-91e8-99460ce69135','c5ad26f8-c94d-49a6-99c0-cef7109a2fa7','entrance_to',false,'inherit','modeled_inference','creator-approved:aurora-public-entrances-v1','active'),
  ('50b06c01-060d-49fa-8988-8f38c13406d7','51d174fb-6091-4447-91e8-99460ce69135','c970c991-9354-432c-94db-3b8d6cb157f8','entrance_to',false,'inherit','modeled_inference','creator-approved:aurora-public-entrances-v1','active'),
  ('50b06c01-060d-49fa-8988-8f38c13406d7','51d174fb-6091-4447-91e8-99460ce69135','3cb50429-aa56-405e-9dc5-761fdf757cd3','entrance_to',false,'inherit','modeled_inference','creator-approved:aurora-public-entrances-v1','active')
on conflict (world_id, from_node_id, to_node_id, relation) do nothing;

do $$
declare
  v_count integer;
  v_bad integer;
begin
  select count(*) into v_count
  from public.zhi_spatial_edges
  where world_id = '50b06c01-060d-49fa-8988-8f38c13406d7'
    and from_node_id = '51d174fb-6091-4447-91e8-99460ce69135'
    and relation = 'entrance_to'
    and source_ref = 'creator-approved:aurora-public-entrances-v1'
    and status = 'active';

  select count(*) into v_bad
  from public.zhi_spatial_edges e
  where e.world_id = '50b06c01-060d-49fa-8988-8f38c13406d7'
    and e.from_node_id = '51d174fb-6091-4447-91e8-99460ce69135'
    and e.to_node_id in (
      '664688d0-4785-432c-93a7-57bf3858f858',
      'c5ad26f8-c94d-49a6-99c0-cef7109a2fa7',
      'c970c991-9354-432c-94db-3b8d6cb157f8',
      '3cb50429-aa56-405e-9dc5-761fdf757cd3'
    )
    and e.relation = 'entrance_to'
    and (e.directed is distinct from false
      or e.access_policy not in ('open','inherit')
      or e.source_kind is distinct from 'modeled_inference'
      or e.status is distinct from 'active');

  if v_count <> 4 or v_bad <> 0 then
    raise exception 'AURORA public entrance migration: postcondition failed (expected four active modeled open entrances)';
  end if;
end $$;

commit;
