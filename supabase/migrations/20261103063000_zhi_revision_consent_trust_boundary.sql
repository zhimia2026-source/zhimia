-- Tighten the proposal-consent trust boundary: only a verified Agent Runtime
-- signature for the exact revision-apply purpose may authorize proposal application.

alter table public.zhi_agent_cognition_consents
  drop constraint if exists zhi_agent_cognition_consents_proposal_grantee_check;
alter table public.zhi_agent_cognition_consents
  add constraint zhi_agent_cognition_consents_proposal_grantee_check
  check (
    proposal_id is null
    or (
      grantee_kind = 'governance_service'
      and grantee_id = 'zhi-community'
      and purpose = 'cognition.revision.apply'
      and scopes @> array['cognition.revision.apply']::text[]
    )
  );

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
      and grantee_kind = 'governance_service'
      and grantee_id = 'zhi-community'
      and purpose = 'cognition.revision.apply'
      and scopes @> array['cognition.revision.apply']::text[]
      and content_sha256 = new.proposed_state_sha256
      and based_on_version = new.based_on_version
      and attestation_verified = true
      and revoked_at is null
      and expires_at > now()
    order by consented_at desc
    limit 1;

    if not found then
      raise exception 'zhi_verified_agent_revision_consent_missing' using errcode = '42501';
    end if;

    if new.agent_consented_content_sha256 is distinct from new.proposed_state_sha256
       or new.agent_consented_base_version is distinct from new.based_on_version
       or new.agent_consented_at is distinct from v_consent.consented_at
       or new.agent_consent_expires_at is null
       or new.agent_consent_expires_at > v_consent.expires_at
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

comment on constraint zhi_agent_cognition_consents_proposal_grantee_check
  on public.zhi_agent_cognition_consents is
  'Revision application consent is addressed only to the ZHI Community governance service and exact cognition.revision.apply scope.';
