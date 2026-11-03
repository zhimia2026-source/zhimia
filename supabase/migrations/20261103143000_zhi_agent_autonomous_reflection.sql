-- Allow Lumen-001 to keep its own bounded, private reflection records.
-- auto_curated is a model-generated internal curation state, not a cryptographic
-- runtime attestation and never grants tool, cross-user, or external-action access.
alter table public.zhi_agent_micro_experiences
  drop constraint if exists zhi_agent_micro_experiences_memory_status_check;
alter table public.zhi_agent_micro_experiences
  add constraint zhi_agent_micro_experiences_memory_status_check
  check (memory_status = any (array['candidate','approved','auto_curated','rejected','archived']::text[]));

alter table public.zhi_agent_micro_experiences
  drop constraint if exists zhi_agent_micro_experiences_review_state_check;
alter table public.zhi_agent_micro_experiences
  add constraint zhi_agent_micro_experiences_review_state_check
  check (
    (memory_status = 'candidate' and reviewed_at is null and reviewed_by_user_id is null)
    or (memory_status = 'auto_curated' and reviewed_at is null and reviewed_by_user_id is null)
    or (memory_status in ('approved','rejected','archived') and reviewed_at is not null and reviewed_by_user_id is not null)
  );

create unique index if not exists zhi_agent_micro_experiences_agent_reflection_source_uidx
  on public.zhi_agent_micro_experiences (agent_id, source_ref)
  where source_kind = 'agent_reflection' and source_ref is not null;
