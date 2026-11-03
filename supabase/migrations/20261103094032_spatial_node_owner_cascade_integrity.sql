-- Preserve private spatial node ownership invariants on agent/user deletion.
alter table public.zhi_spatial_nodes
  drop constraint if exists zhi_spatial_nodes_owner_agent_id_fkey,
  drop constraint if exists zhi_spatial_nodes_owner_user_id_fkey;
alter table public.zhi_spatial_nodes
  add constraint zhi_spatial_nodes_owner_agent_id_fkey
    foreign key(owner_agent_id) references public.zhi_agents(id) on delete cascade,
  add constraint zhi_spatial_nodes_owner_user_id_fkey
    foreign key(owner_user_id) references auth.users(id) on delete cascade;
