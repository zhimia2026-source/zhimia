update public.zhi_federation_peers
set capabilities=array(
 select distinct unnest(coalesce(capabilities,'{}'::text[]) || array['spatial.perception.read']::text[])
)
where peer_key='mia-cloud' and revoked_at is null;
