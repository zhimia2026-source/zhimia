update public.zhi_federation_peers
set capabilities = array(
  select distinct unnest(coalesce(capabilities,'{}'::text[]) || array['spatial.anchor.publish','spatial.anchor.read']::text[])
)
where peer_key='mia-cloud' and revoked_at is null;
