-- ZHI Agent consent attestation gate V0.1
alter table public.zhi_agent_cognition_consents
  add column if not exists attestation_verified boolean not null default false;

alter table public.zhi_agent_cognition_consents
  drop constraint if exists zhi_agent_cognition_consents_verified_attestation_check;
alter table public.zhi_agent_cognition_consents
  add constraint zhi_agent_cognition_consents_verified_attestation_check
  check (
    attestation_verified = false
    or (
      runtime_attestation ? 'key_id'
      and runtime_attestation ? 'algorithm'
      and runtime_attestation ? 'signature'
      and char_length(coalesce(runtime_attestation->>'signature','')) >= 32
    )
  );

create or replace function public.zhi_guard_cognition_consent()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'zhi_cognition_consent_history_is_append_only' using errcode = '42501';
  end if;

  if new.agent_id is distinct from old.agent_id
     or new.owner_user_id is distinct from old.owner_user_id
     or new.proposal_id is distinct from old.proposal_id
     or new.grantee_kind is distinct from old.grantee_kind
     or new.grantee_id is distinct from old.grantee_id
     or new.purpose is distinct from old.purpose
     or new.scopes is distinct from old.scopes
     or new.content_sha256 is distinct from old.content_sha256
     or new.based_on_version is distinct from old.based_on_version
     or new.consent_event_id is distinct from old.consent_event_id
     or new.consent_nonce_hash is distinct from old.consent_nonce_hash
     or new.runtime_attestation is distinct from old.runtime_attestation
     or new.attestation_verified is distinct from old.attestation_verified
     or new.consented_at is distinct from old.consented_at
     or new.expires_at is distinct from old.expires_at then
    raise exception 'zhi_cognition_consent_proof_immutable' using errcode = '42501';
  end if;

  if old.revoked_at is not null or new.revoked_at is null then
    raise exception 'zhi_cognition_consent_revocation_is_one_way' using errcode = '42501';
  end if;

  return new;
end;
$function$;

drop trigger if exists zhi_agent_cognition_consents_integrity on public.zhi_agent_cognition_consents;
create trigger zhi_agent_cognition_consents_integrity
before update or delete on public.zhi_agent_cognition_consents
for each row execute function public.zhi_guard_cognition_consent();

revoke all on function public.zhi_guard_cognition_consent() from public, anon, authenticated;

comment on column public.zhi_agent_cognition_consents.attestation_verified is
  'Only set true by a trusted Edge Function after cryptographic Agent Runtime signature verification; default false denies all third-party private cognition reads.';
