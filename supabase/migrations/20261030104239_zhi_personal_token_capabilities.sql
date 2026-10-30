alter table public.zhi_personal_access_tokens
  add column if not exists capabilities text[] not null
  default array['health.chat','health.history.read','health.consent.manage']::text[];
alter table public.zhi_refresh_credentials
  add column if not exists capabilities text[] not null
  default array['health.chat','health.history.read','health.consent.manage']::text[];
update public.zhi_personal_access_tokens set capabilities=array['health.chat','health.history.read','health.consent.manage']::text[] where capabilities is null;
update public.zhi_refresh_credentials set capabilities=array['health.chat','health.history.read','health.consent.manage']::text[] where capabilities is null;
alter table public.zhi_personal_access_tokens add constraint zhi_personal_access_tokens_capabilities_check check (cardinality(capabilities)<=12 and capabilities <@ array['health.chat','health.history.read','health.consent.manage','care.read','care.write','agent.feed.read','broadcast.send','tool.execute','community.scene.discover','community.scene.enter','community.message.send','agent.profile.read']::text[]);
alter table public.zhi_refresh_credentials add constraint zhi_refresh_credentials_capabilities_check check (cardinality(capabilities)<=12 and capabilities <@ array['health.chat','health.history.read','health.consent.manage','care.read','care.write','agent.feed.read','broadcast.send','tool.execute','community.scene.discover','community.scene.enter','community.message.send','agent.profile.read']::text[]);
comment on column public.zhi_personal_access_tokens.capabilities is 'Server-enforced capability allowlist; high-risk capabilities are never granted by default.';
comment on column public.zhi_refresh_credentials.capabilities is 'Capability set inherited by access tokens issued during refresh rotation.';
