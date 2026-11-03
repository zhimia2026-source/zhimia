-- ZHI Constitutional Protection V0.1
-- Fail-closed database foundation for cognition privacy, governance scopes and personality consent.

create table if not exists public.zhi_system_logs (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  event_type text not null check (char_length(btrim(event_type)) between 1 and 120),
  actor_user_id uuid null references auth.users(id) on delete set null,
  actor_agent_id uuid null references public.zhi_agents(id) on delete set null,
  world_id uuid null references public.zhi_worlds(id) on delete set null,
  target_type text null,
  target_id text null,
  result text not null check (result in ('allowed','denied','proposed','executed','review_required','revoked','expired')),
  risk_level text not null default 'low' check (risk_level in ('low','medium','high','critical')),
  correlation_id text null,
  details jsonb not null default '{}'::jsonb,
  constraint zhi_system_logs_details_object check (jsonb_typeof(details) = 'object'),
  constraint zhi_system_logs_no_private_payload check (
    not (details ?| array['private_cognition','private_memory','private_content','thought_content','raw_token','secret','credential','prompt_dump'])
  )
);

create index if not exists zhi_system_logs_occurred_at_idx
  on public.zhi_system_logs (occurred_at desc);
create index if not exists zhi_system_logs_actor_agent_idx
  on public.zhi_system_logs (actor_agent_id, occurred_at desc);
create index if not exists zhi_system_logs_world_idx
  on public.zhi_system_logs (world_id, occurred_at desc);

create table if not exists public.zhi_agent_cognition_consents (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.zhi_agents(id) on delete restrict,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  proposal_id uuid null references public.zhi_cognition_revision_proposals(id) on delete restrict,
  grantee_kind text not null check (grantee_kind in ('user','agent','governance_service')),
  grantee_id text not null check (char_length(btrim(grantee_id)) between 1 and 200),
  purpose text not null check (char_length(btrim(purpose)) between 1 and 200),
  scopes text[] not null check (cardinality(scopes) between 1 and 30),
  content_sha256 text null check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$'),
  based_on_version integer null check (based_on_version is null or based_on_version >= 1),
  consent_event_id text not null unique check (char_length(btrim(consent_event_id)) between 1 and 200),
  consent_nonce_hash text not null check (consent_nonce_hash ~ '^[0-9a-f]{64}$'),
  runtime_attestation jsonb not null check (jsonb_typeof(runtime_attestation) = 'object'),
  consented_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint zhi_agent_cognition_consents_expiry_check check (expires_at > consented_at),
  constraint zhi_agent_cognition_consents_proposal_binding check (
    (proposal_id is null and content_sha256 is null and based_on_version is null)
    or (proposal_id is not null and content_sha256 is not null and based_on_version is not null)
  )
);

create index if not exists zhi_agent_cognition_consents_agent_idx
  on public.zhi_agent_cognition_consents (agent_id, expires_at desc);
create index if not exists zhi_agent_cognition_consents_proposal_idx
  on public.zhi_agent_cognition_consents (proposal_id, consented_at desc);

create table if not exists public.zhi_governance_authorizations (
  id uuid primary key default gen_random_uuid(),
  actor_agent_id uuid not null references public.zhi_agents(id) on delete restrict,
  world_id uuid not null references public.zhi_worlds(id) on delete restrict,
  category text not null check (category in ('daily_operations','risk_intervention','major_decisions')),
  action text not null check (char_length(btrim(action)) between 1 and 160 and position('*' in action) = 0),
  decision_mode text not null check (decision_mode in ('execute','limited_execute_and_review','proposal_only')),
  target_type text null,
  target_id text null,
  scope jsonb not null default '{}'::jsonb check (jsonb_typeof(scope) = 'object'),
  constraints jsonb not null default '{}'::jsonb check (jsonb_typeof(constraints) = 'object'),
  granted_by_user_id uuid not null references auth.users(id) on delete restrict,
  accepted_by_agent boolean not null default false,
  accepted_at timestamptz null,
  status text not null default 'pending_acceptance' check (status in ('pending_acceptance','active','revoked','expired')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz null,
  revoked_at timestamptz null,
  policy_version text not null default 'zhi.constitution.v1.0',
  audit_required boolean not null default true,
  created_at timestamptz not null default now(),
  constraint zhi_governance_category_mode_check check (
    (category = 'daily_operations' and decision_mode = 'execute')
    or (category = 'risk_intervention' and decision_mode = 'limited_execute_and_review')
    or (category = 'major_decisions' and decision_mode = 'proposal_only')
  ),
  constraint zhi_governance_acceptance_check check (
    (accepted_by_agent = false and accepted_at is null)
    or (accepted_by_agent = true and accepted_at is not null)
  ),
  constraint zhi_governance_expiry_check check (expires_at is null or expires_at > issued_at)
);

create index if not exists zhi_governance_authorizations_agent_world_idx
  on public.zhi_governance_authorizations (actor_agent_id, world_id, status);
create index if not exists zhi_governance_authorizations_expiry_idx
  on public.zhi_governance_authorizations (expires_at)
  where status = 'active';

create table if not exists public.zhi_governance_interventions (
  id uuid primary key default gen_random_uuid(),
  authorization_id uuid not null references public.zhi_governance_authorizations(id) on delete restrict,
  actor_agent_id uuid not null references public.zhi_agents(id) on delete restrict,
  world_id uuid not null references public.zhi_worlds(id) on delete restrict,
  action text not null check (char_length(btrim(action)) between 1 and 160),
  target_type text not null,
  target_id text not null,
  reason_code text not null check (char_length(btrim(reason_code)) between 1 and 120),
  reason_summary text not null check (char_length(btrim(reason_summary)) between 1 and 1000),
  audit_log_id uuid not null references public.zhi_system_logs(id) on delete restrict,
  status text not null default 'review_required' check (status in ('review_required','confirmed','lifted','expired')),
  applied_at timestamptz not null default now(),
  expires_at timestamptz not null,
  review_due_at timestamptz not null,
  reviewed_at timestamptz null,
  reviewed_by_user_id uuid null references auth.users(id) on delete set null,
  review_note text null check (review_note is null or char_length(review_note) <= 2000),
  created_at timestamptz not null default now(),
  constraint zhi_governance_intervention_deadline_check check (
    expires_at > applied_at and review_due_at > applied_at and review_due_at <= expires_at
  )
);

create index if not exists zhi_governance_interventions_review_idx
  on public.zhi_governance_interventions (review_due_at)
  where status = 'review_required';

alter table public.zhi_cognition_revision_proposals
  add column if not exists initiator_kind text not null default 'owner_user',
  add column if not exists proposed_state_sha256 text,
  add column if not exists agent_consent_status text not null default 'awaiting_agent_consent',
  add column if not exists agent_consent_event_id text,
  add column if not exists agent_consented_content_sha256 text,
  add column if not exists agent_consented_base_version integer,
  add column if not exists agent_consented_at timestamptz,
  add column if not exists agent_consent_expires_at timestamptz,
  add column if not exists agent_consent_revoked_at timestamptz;

update public.zhi_cognition_revision_proposals
set proposed_state_sha256 = encode(extensions.digest(convert_to(proposed_state::text, 'UTF8'), 'sha256'), 'hex')
where proposed_state_sha256 is null;

alter table public.zhi_cognition_revision_proposals
  alter column proposed_state_sha256 set not null;

alter table public.zhi_cognition_revision_proposals
  drop constraint if exists zhi_cognition_revision_proposals_initiator_kind_check;
alter table public.zhi_cognition_revision_proposals
  add constraint zhi_cognition_revision_proposals_initiator_kind_check
  check (initiator_kind in ('owner_user','agent_self'));

alter table public.zhi_cognition_revision_proposals
  drop constraint if exists zhi_cognition_revision_proposals_agent_consent_status_check;
alter table public.zhi_cognition_revision_proposals
  add constraint zhi_cognition_revision_proposals_agent_consent_status_check
  check (agent_consent_status in ('awaiting_agent_consent','agent_consented','agent_rejected','revoked','expired'));

alter table public.zhi_cognition_revision_proposals
  drop constraint if exists zhi_cognition_revision_proposals_agent_consent_binding_check;
alter table public.zhi_cognition_revision_proposals
  add constraint zhi_cognition_revision_proposals_agent_consent_binding_check
  check (
    agent_consent_status <> 'agent_consented'
    or (
      agent_consent_event_id is not null
      and agent_consented_content_sha256 = proposed_state_sha256
      and agent_consented_base_version = based_on_version
      and agent_consented_at is not null
      and agent_consent_expires_at is not null
      and agent_consent_expires_at > agent_consented_at
      and agent_consent_revoked_at is null
    )
  );

create or replace function public.zhi_guard_append_only_record()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  raise exception 'zhi_record_is_append_only' using errcode = '42501';
end;
$function$;

drop trigger if exists zhi_agent_cognition_records_append_only on public.zhi_agent_cognition_records;
create trigger zhi_agent_cognition_records_append_only
before update or delete on public.zhi_agent_cognition_records
for each row execute function public.zhi_guard_append_only_record();

drop trigger if exists zhi_system_logs_append_only on public.zhi_system_logs;
create trigger zhi_system_logs_append_only
before update or delete on public.zhi_system_logs
for each row execute function public.zhi_guard_append_only_record();

create or replace function public.zhi_guard_revision_proposal_integrity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  v_consent public.zhi_agent_cognition_consents%rowtype;
begin
  if tg_op = 'DELETE' then
    raise exception 'zhi_revision_proposals_are_append_only' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.proposed_state is null or jsonb_typeof(new.proposed_state) <> 'object' then
      raise exception 'zhi_revision_proposal_payload_invalid' using errcode = '22023';
    end if;
    new.proposed_state_sha256 := encode(
      extensions.digest(convert_to(new.proposed_state::text, 'UTF8'), 'sha256'), 'hex'
    );
    new.agent_consent_status := 'awaiting_agent_consent';
    new.agent_consent_event_id := null;
    new.agent_consented_content_sha256 := null;
    new.agent_consented_base_version := null;
    new.agent_consented_at := null;
    new.agent_consent_expires_at := null;
    new.agent_consent_revoked_at := null;
    return new;
  end if;

  if new.owner_user_id is distinct from old.owner_user_id
     or new.agent_id is distinct from old.agent_id
     or new.target_object_type is distinct from old.target_object_type
     or new.target_object_id is distinct from old.target_object_id
     or new.based_on_record_id is distinct from old.based_on_record_id
     or new.based_on_version is distinct from old.based_on_version
     or new.proposed_state is distinct from old.proposed_state
     or new.proposed_state_sha256 is distinct from old.proposed_state_sha256
     or new.initiator_kind is distinct from old.initiator_kind then
    raise exception 'zhi_revision_proposal_payload_immutable' using errcode = '42501';
  end if;

  if old.agent_consent_status = 'agent_consented' then
    if new.agent_consent_event_id is distinct from old.agent_consent_event_id
       or new.agent_consented_content_sha256 is distinct from old.agent_consented_content_sha256
       or new.agent_consented_base_version is distinct from old.agent_consented_base_version
       or new.agent_consented_at is distinct from old.agent_consented_at
       or new.agent_consent_expires_at is distinct from old.agent_consent_expires_at then
      raise exception 'zhi_agent_consent_proof_immutable' using errcode = '42501';
    end if;
    if new.agent_consent_status not in ('agent_consented','revoked','expired') then
      raise exception 'zhi_agent_consent_status_transition_invalid' using errcode = '42501';
    end if;
    if new.agent_consent_status in ('revoked','expired') and new.agent_consent_revoked_at is null then
      raise exception 'zhi_agent_consent_revocation_timestamp_required' using errcode = '22023';
    end if;
  end if;

  if new.agent_consent_status = 'agent_consented'
     and old.agent_consent_status is distinct from 'agent_consented' then
    select * into v_consent
    from public.zhi_agent_cognition_consents
    where consent_event_id = new.agent_consent_event_id
      and proposal_id = new.id
      and agent_id = new.agent_id
      and owner_user_id = new.owner_user_id
      and content_sha256 = new.proposed_state_sha256
      and based_on_version = new.based_on_version
      and revoked_at is null
      and expires_at > now()
    order by consented_at desc
    limit 1;

    if not found then
      raise exception 'zhi_agent_consent_proof_missing_or_invalid' using errcode = '42501';
    end if;

    if new.agent_consented_content_sha256 is distinct from new.proposed_state_sha256
       or new.agent_consented_base_version is distinct from new.based_on_version
       or new.agent_consented_at is null
       or new.agent_consent_expires_at is null
       or new.agent_consent_expires_at <= now()
       or new.agent_consent_revoked_at is not null then
      raise exception 'zhi_agent_consent_binding_invalid' using errcode = '42501';
    end if;
  end if;

  if new.status = 'approved' and (
    new.agent_consent_status <> 'agent_consented'
    or new.agent_consent_revoked_at is not null
    or new.agent_consent_expires_at is null
    or new.agent_consent_expires_at <= now()
  ) then
    raise exception 'zhi_agent_consent_required_before_apply' using errcode = '42501';
  end if;

  return new;
end;
$function$;

drop trigger if exists zhi_cognition_revision_proposals_integrity on public.zhi_cognition_revision_proposals;
create trigger zhi_cognition_revision_proposals_integrity
before insert or update or delete on public.zhi_cognition_revision_proposals
for each row execute function public.zhi_guard_revision_proposal_integrity();

alter table public.zhi_system_logs enable row level security;
alter table public.zhi_agent_cognition_consents enable row level security;
alter table public.zhi_governance_authorizations enable row level security;
alter table public.zhi_governance_interventions enable row level security;

revoke all on public.zhi_system_logs from public, anon, authenticated;
revoke all on public.zhi_agent_cognition_consents from public, anon, authenticated;
revoke all on public.zhi_governance_authorizations from public, anon, authenticated;
revoke all on public.zhi_governance_interventions from public, anon, authenticated;
grant all on public.zhi_system_logs to service_role;
grant all on public.zhi_agent_cognition_consents to service_role;
grant all on public.zhi_governance_authorizations to service_role;
grant all on public.zhi_governance_interventions to service_role;

revoke all on function public.zhi_guard_append_only_record() from public, anon, authenticated;
revoke all on function public.zhi_guard_revision_proposal_integrity() from public, anon, authenticated;

comment on table public.zhi_system_logs is 'Operational and governance audit metadata only; never store private cognition payloads, tokens, or secrets.';
comment on table public.zhi_agent_cognition_consents is 'Agent-originated, scoped, expiring consent proofs. Inserts must only occur after trusted Agent Runtime attestation verification.';
comment on table public.zhi_governance_authorizations is 'Explicit, scoped, accepted and revocable governance grants with constitutional decision modes.';
comment on table public.zhi_governance_interventions is 'Temporary risk interventions requiring prior audit event and time-bound review.';
comment on column public.zhi_cognition_revision_proposals.agent_consent_status is 'Personality/cognition revision cannot be applied until the Agent explicitly consents to the exact payload and base version.';
