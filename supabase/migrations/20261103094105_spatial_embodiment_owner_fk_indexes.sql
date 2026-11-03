create index if not exists zhi_spatial_nodes_owner_user_fk_idx on public.zhi_spatial_nodes(owner_user_id) where owner_user_id is not null;
create index if not exists zhi_spatial_presence_agent_owner_fk_idx on public.zhi_spatial_presence(agent_id,owner_user_id);
create index if not exists zhi_spatial_perception_agent_owner_fk_idx on public.zhi_spatial_perception_events(agent_id,owner_user_id);
