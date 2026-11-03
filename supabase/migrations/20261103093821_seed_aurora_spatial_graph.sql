-- Idempotent seed of object nodes and containment edges from persisted Aurora model state.
insert into public.zhi_spatial_nodes
  (world_id,parent_node_id,node_type,stable_key,name,description,visibility,entry_policy,source_kind,source_ref,source_updated_at,observability,metadata)
select e.world_id,reg.id,'object',obj.key,obj.value->>'name',coalesce(obj.value->>'state',''),
       'public','inherit','ecosystem_model','zhi_ecosystem_states.state.objects:'||obj.key,
       e.updated_at,'known',
       jsonb_build_object('epistemic_status','known_fact',
         'lifecycle_stage',obj.value->>'lifecycle_stage',
         'lifecycle_status',obj.value->>'lifecycle_status',
         'material_profile',obj.value->>'material_profile')
from public.zhi_ecosystem_states e
cross join lateral jsonb_each(coalesce(e.state->'objects','{}'::jsonb)) obj
join lateral jsonb_array_elements(coalesce(e.state->'regions','[]'::jsonb)) region
  on coalesce(region->'object_ids','[]'::jsonb) ? obj.key
join public.zhi_spatial_nodes reg on reg.world_id=e.world_id and reg.stable_key=region->>'id'
where e.world_id='50b06c01-060d-49fa-8988-8f38c13406d7'
on conflict (world_id,stable_key) do update set
 parent_node_id=excluded.parent_node_id,name=excluded.name,description=excluded.description,
 source_updated_at=excluded.source_updated_at,metadata=excluded.metadata,updated_at=now();

insert into public.zhi_spatial_edges(world_id,from_node_id,to_node_id,relation,source_kind,source_ref)
select world_id,parent_node_id,id,'contains','modeled_inference','zhi_ecosystem_states.state'
from public.zhi_spatial_nodes
where world_id='50b06c01-060d-49fa-8988-8f38c13406d7'
and node_type in ('region','object') and parent_node_id is not null
on conflict (world_id,from_node_id,to_node_id,relation) do nothing;
