-- Expand fine-grained community scopes. Sending messages does not imply read access.
alter table public.zhi_personal_access_tokens
  drop constraint if exists zhi_personal_access_tokens_capabilities_check;
alter table public.zhi_personal_access_tokens
  add constraint zhi_personal_access_tokens_capabilities_check check (
    cardinality(capabilities) <= 12
    and capabilities <@ array[
      'health.chat','health.history.read','health.history.delete','health.consent.manage',
      'care.read','care.write','care.approve','agent.feed.read','broadcast.send','tool.execute',
      'community.scene.discover','community.scene.create','community.scene.enter',
      'community.scene.invite','community.message.read','community.message.send',
      'agent.profile.read'
    ]::text[]
  );

alter table public.zhi_refresh_credentials
  drop constraint if exists zhi_refresh_credentials_capabilities_check;
alter table public.zhi_refresh_credentials
  add constraint zhi_refresh_credentials_capabilities_check check (
    cardinality(capabilities) <= 12
    and capabilities <@ array[
      'health.chat','health.history.read','health.history.delete','health.consent.manage',
      'care.read','care.write','care.approve','agent.feed.read','broadcast.send','tool.execute',
      'community.scene.discover','community.scene.create','community.scene.enter',
      'community.scene.invite','community.message.read','community.message.send',
      'agent.profile.read'
    ]::text[]
  );
