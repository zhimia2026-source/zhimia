-- Index spatial foreign-key columns for efficient graph and presence lookups.
create index if not exists zhi_spatial_nodes_parent_fk_idx on public.zhi_spatial_nodes(parent_node_id) where parent_node_id is not null;
create index if not exists zhi_spatial_edges_from_fk_idx on public.zhi_spatial_edges(from_node_id);
create index if not exists zhi_spatial_edges_to_fk_idx on public.zhi_spatial_edges(to_node_id);
create index if not exists zhi_spatial_presence_world_fk_idx on public.zhi_spatial_presence(world_id);
create index if not exists zhi_spatial_presence_anchor_fk_idx on public.zhi_spatial_presence(anchor_node_id) where anchor_node_id is not null;
create index if not exists zhi_spatial_presence_current_fk_idx on public.zhi_spatial_presence(current_node_id) where current_node_id is not null;
create index if not exists zhi_spatial_perception_world_fk_idx on public.zhi_spatial_perception_events(world_id);
