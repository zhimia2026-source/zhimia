-- ZHI Micro-Experience Memory v1.1
-- Adds explicit least-privilege scopes and enforces reviewed-state metadata.

begin;

alter table public.zhi_personal_access_tokens
  drop constraint if exists zhi_personal_access_tokens_capabilities_check;
alter table public.zhi_personal_access_tokens
  add constraint zhi_personal_access_tokens_capabilities_check
  check (
    cardinality(capabilities) <= 12
    and capabilities <@ array[
      'health.chat','health.history.read','health.history.delete','health.consent.manage',
      'care.read','care.write','care.approve','agent.feed.read','broadcast.send','tool.execute',
      'community.scene.discover','community.scene.create','community.scene.enter',
      'community.scene.invite','community.message.read','community.message.send','agent.profile.read',
      'agent.memory.read','agent.memory.write','agent.memory.approve','agent.memory.delete'
    ]::text[]
  );

alter table public.zhi_refresh_credentials
  drop constraint if exists zhi_refresh_credentials_capabilities_check;
alter table public.zhi_refresh_credentials
  add constraint zhi_refresh_credentials_capabilities_check
  check (
    cardinality(capabilities) <= 12
    and capabilities <@ array[
      'health.chat','health.history.read','health.history.delete','health.consent.manage',
      'care.read','care.write','care.approve','agent.feed.read','broadcast.send','tool.execute',
      'community.scene.discover','community.scene.create','community.scene.enter',
      'community.scene.invite','community.message.read','community.message.send','agent.profile.read',
      'agent.memory.read','agent.memory.write','agent.memory.approve','agent.memory.delete'
    ]::text[]
  );

alter table public.zhi_agent_micro_experiences
  drop constraint if exists zhi_agent_micro_experiences_review_state_check;
alter table public.zhi_agent_micro_experiences
  add constraint zhi_agent_micro_experiences_review_state_check
  check (
    (memory_status = 'candidate' and reviewed_at is null and reviewed_by_user_id is null)
    or
    (memory_status in ('approved','rejected','archived')
      and reviewed_at is not null and reviewed_by_user_id is not null)
  );

commit;
