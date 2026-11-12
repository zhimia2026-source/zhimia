-- DESIGN PROPOSAL ONLY — NOT A DEPLOYABLE MIGRATION.
-- Generate the actual migration with \`supabase migration new zhi_agent_consent_gateway\`
-- after disposable-project replay and review against the target project's exact schema.
-- Never apply this file directly to production.

begin;

create schema if not exists zhi_security;
revoke all on schema zhi_security from public, anon, authenticated, service_role;

create table if not exists zhi_security.agent_runtime_signing_keys (
  key_id text primary key,
  agent_id uuid not null,
  owner_user_id uuid not null,
  algorithm text not null check (algorithm = 'Ed25519'),
  public_jwk jsonb not null,
  is_active boolean not null default true,
  valid_from timestamptz not null,
  valid_until timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint agent_runtime_key_jwk_shape check (
    jsonb_typeof(public_jwk) = 'object'
    and public_jwk->>'kty' = 'OKP'
    and public_jwk->>'crv' = 'Ed25519'
    and public_jwk ? 'x'
    and not (public_jwk ? 'd')
  ),
  constraint agent_runtime_key_validity check (valid_until is null or valid_until > valid_from),
  constraint agent_runtime_key_agent_owner_fk
    foreign key (agent_id, owner_user_id)
    references public.zhi_agents(id, owner_user_id) on delete cascade
);

create index if not exists agent_runtime_signing_keys_agent_idx
  on zhi_security.agent_runtime_signing_keys(agent_id, owner_user_id)
  where is_active and revoked_at is null;

create table if not exists zhi_security.consumed_agent_consent_nonces (
  nonce_sha256 text primary key check (nonce_sha256 ~ '^[0-9a-f]{64}$'),
  key_id text not null references zhi_security.agent_runtime_signing_keys(key_id),
  agent_id uuid not null references public.zhi_agents(id) on delete cascade,
  consent_event_id text not null,
  consumed_at timestamptz not null default now()
);

create table if not exists zhi_security.gateway_secrets (
  secret_name text primary key check (secret_name = 'agent_consent_gateway_hmac'),
  secret_value bytea not null check (octet_length(secret_value) >= 32),
  updated_at timestamptz not null default now()
);

alter table zhi_security.agent_runtime_signing_keys enable row level security;
alter table zhi_security.consumed_agent_consent_nonces enable row level security;
alter table zhi_security.gateway_secrets enable row level security;

revoke all on all tables in schema zhi_security from public, anon, authenticated, service_role;

create or replace function public.zhi_get_agent_runtime_signing_key(
  p_key_id text,
  p_agent_id uuid,
  p_owner_user_id uuid
) returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'key_id', k.key_id,
    'algorithm', k.algorithm,
    'public_jwk', k.public_jwk,
    'agent_id', k.agent_id,
    'owner_user_id', k.owner_user_id,
    'is_active', k.is_active,
    'valid_from', k.valid_from,
    'valid_until', k.valid_until,
    'revoked_at', k.revoked_at
  )
  from zhi_security.agent_runtime_signing_keys k
  where k.key_id = p_key_id
    and k.agent_id = p_agent_id
    and k.owner_user_id = p_owner_user_id
    and k.algorithm = 'Ed25519'
    and k.is_active
    and k.revoked_at is null
    and k.valid_from <= now()
    and (k.valid_until is null or k.valid_until > now())
  limit 1;
$$;

revoke all on function public.zhi_get_agent_runtime_signing_key(text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.zhi_get_agent_runtime_signing_key(text, uuid, uuid)
  to service_role;

create or replace function public.zhi_issue_verified_agent_consent(
  p_payload_text text,
  p_key_id text,
  p_signature text,
  p_gateway_mac text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_secret bytea;
  v_expected_mac text;
  v_mac_diff integer := 0;
  v_mac_index integer;
  v_nonce_hash text;
  v_agent_owner uuid;
  v_key zhi_security.agent_runtime_signing_keys%rowtype;
  v_proposal public.zhi_cognition_revision_proposals%rowtype;
  v_consent_id uuid;
  v_issued_at timestamptz;
  v_expires_at timestamptz;
  v_proposal_id uuid;
  v_content_hash text;
  v_base_version integer;
  v_allowed_keys text[] := array[
    'agent_id', 'based_on_version', 'consent_event_id', 'content_sha256',
    'expires_at', 'grantee_id', 'grantee_kind', 'issued_at', 'nonce',
    'owner_user_id', 'proposal_id', 'purpose', 'scopes'
  ];
  v_key_name text;
begin
  if p_payload_text is null or length(p_payload_text) > 16384
     or p_key_id is null or p_signature is null then
    raise exception 'attestation_gateway_input_invalid';
  end if;

  select secret_value into v_secret
  from zhi_security.gateway_secrets
  where secret_name = 'agent_consent_gateway_hmac';

  if v_secret is null or octet_length(v_secret) < 32 then
    raise exception 'attestation_gateway_secret_not_configured';
  end if;

  v_expected_mac := encode(
    extensions.hmac(
      convert_to(p_payload_text || '.' || p_key_id || '.' || p_signature, 'UTF8'),
      v_secret,
      'sha256'
    ),
    'hex'
  );

  if p_gateway_mac is null or p_gateway_mac !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'attestation_gateway_mac_invalid';
  end if;

  -- Fixed-length comparison avoids early-exit string equality on the MAC.
  for v_mac_index in 1..64 loop
    v_mac_diff := v_mac_diff |
      (ascii(substr(v_expected_mac, v_mac_index, 1)) #
       ascii(substr(lower(p_gateway_mac), v_mac_index, 1)));
  end loop;

  if v_mac_diff <> 0 then
    raise exception 'attestation_gateway_mac_invalid';
  end if;

  v_payload := p_payload_text::jsonb;
  if jsonb_typeof(v_payload) is distinct from 'object' then
    raise exception 'attestation_payload_schema_invalid';
  end if;

  if (select count(*) from jsonb_object_keys(v_payload)) <> cardinality(v_allowed_keys) then
    raise exception 'attestation_payload_schema_invalid';
  end if;

  for v_key_name in select jsonb_object_keys(v_payload)
  loop
    if not (v_key_name = any(v_allowed_keys)) then
      raise exception 'attestation_payload_schema_invalid';
    end if;
  end loop;

  foreach v_key_name in array v_allowed_keys
  loop
    if not (v_payload ? v_key_name) then
      raise exception 'attestation_payload_schema_invalid';
    end if;
  end loop;

  if jsonb_typeof(v_payload->'scopes') is distinct from 'array' then
    raise exception 'attestation_payload_scopes_invalid';
  end if;

  if jsonb_array_length(v_payload->'scopes') < 1
     or jsonb_array_length(v_payload->'scopes') > 30 then
    raise exception 'attestation_payload_scopes_invalid';
  end if;

  v_issued_at := (v_payload->>'issued_at')::timestamptz;
  v_expires_at := (v_payload->>'expires_at')::timestamptz;

  if v_issued_at is null or v_expires_at is null
     or v_issued_at > now() + interval '60 seconds'
     or v_issued_at < now() - interval '24 hours'
     or v_expires_at <= now()
     or v_expires_at <= v_issued_at
     or v_expires_at > v_issued_at + interval '24 hours' then
    raise exception 'attestation_time_invalid';
  end if;

  select * into v_key
  from zhi_security.agent_runtime_signing_keys
  where key_id = p_key_id
    and agent_id = (v_payload->>'agent_id')::uuid
    and owner_user_id = (v_payload->>'owner_user_id')::uuid
    and algorithm = 'Ed25519'
    and is_active
    and revoked_at is null
    and valid_from <= now()
    and (valid_until is null or valid_until > now())
  for share;

  if not found then
    raise exception 'attestation_runtime_key_unavailable';
  end if;

  if v_issued_at < v_key.valid_from
     or (v_key.valid_until is not null and v_expires_at > v_key.valid_until) then
    raise exception 'attestation_key_validity_mismatch';
  end if;

  select a.owner_user_id into v_agent_owner
  from public.zhi_agents a
  where a.id = (v_payload->>'agent_id')::uuid;

  if v_agent_owner is null
     or v_agent_owner <> (v_payload->>'owner_user_id')::uuid then
    raise exception 'attestation_agent_owner_mismatch';
  end if;

  v_proposal_id := nullif(v_payload->>'proposal_id', '')::uuid;
  v_content_hash := nullif(v_payload->>'content_sha256', '');
  v_base_version := nullif(v_payload->>'based_on_version', '')::integer;

  if v_proposal_id is null then
    if v_content_hash is not null or v_base_version is not null then
      raise exception 'attestation_proposal_binding_fields_invalid';
    end if;

    if v_payload->>'grantee_kind' <> 'user'
       or v_payload->>'grantee_id' <> v_payload->>'owner_user_id' then
      raise exception 'attestation_non_proposal_consent_must_bind_owner_user';
    end if;
  else
    if v_content_hash is null
       or v_base_version is null
       or v_base_version < 1
       or v_payload->>'grantee_kind' <> 'governance_service'
       or v_payload->>'grantee_id' <> 'zhi-community'
       or v_payload->>'purpose' <> 'cognition.revision.apply'
       or not ((v_payload->'scopes') @> '["cognition.revision.apply"]'::jsonb) then
      raise exception 'attestation_revision_consent_scope_invalid';
    end if;

    select * into v_proposal
    from public.zhi_cognition_revision_proposals p
    where p.id = v_proposal_id
      and p.agent_id = (v_payload->>'agent_id')::uuid
      and p.owner_user_id = (v_payload->>'owner_user_id')::uuid
      and p.proposed_state_sha256 = v_content_hash
      and p.based_on_version = v_base_version
      and p.status = 'shadow_proposed'
      and p.agent_consent_status in ('awaiting_agent_consent', 'expired', 'revoked')
    for share;

    if not found then
      raise exception 'attestation_revision_proposal_binding_mismatch';
    end if;
  end if;

  v_nonce_hash := encode(
    extensions.digest(convert_to(v_payload->>'nonce', 'UTF8'), 'sha256'),
    'hex'
  );

  -- Unique nonce insertion and consent insertion share one transaction.
  -- If the consent insert fails, the nonce insert rolls back as well.
  insert into zhi_security.consumed_agent_consent_nonces
    (nonce_sha256, key_id, agent_id, consent_event_id)
  values (
    v_nonce_hash,
    p_key_id,
    (v_payload->>'agent_id')::uuid,
    v_payload->>'consent_event_id'
  );

  insert into public.zhi_agent_cognition_consents (
    agent_id,
    owner_user_id,
    proposal_id,
    grantee_kind,
    grantee_id,
    purpose,
    scopes,
    content_sha256,
    based_on_version,
    consent_event_id,
    consent_nonce_hash,
    runtime_attestation,
    consented_at,
    expires_at,
    attestation_verified
  ) values (
    (v_payload->>'agent_id')::uuid,
    (v_payload->>'owner_user_id')::uuid,
    v_proposal_id,
    v_payload->>'grantee_kind',
    v_payload->>'grantee_id',
    v_payload->>'purpose',
    array(select jsonb_array_elements_text(v_payload->'scopes')),
    v_content_hash,
    v_base_version,
    v_payload->>'consent_event_id',
    v_nonce_hash,
    jsonb_build_object(
      'key_id', p_key_id,
      'algorithm', 'Ed25519',
      'signature', p_signature,
      'payload_sha256', encode(extensions.digest(convert_to(p_payload_text, 'UTF8'), 'sha256'), 'hex'),
      'verified_by', 'zhi-agent-consent-gateway'
    ),
    v_issued_at,
    v_expires_at,
    true
  )
  returning id into v_consent_id;

  return v_consent_id;
end;
$$;

revoke all on function public.zhi_issue_verified_agent_consent(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.zhi_issue_verified_agent_consent(text, text, text, text)
  to service_role;

-- Close direct service-role bypasses. Keep only the column-level one-way revocation permission.
-- This protects proof fields, row identity, timestamps, and append-only history.
revoke insert, update, delete, truncate, trigger, references
  on public.zhi_agent_cognition_consents from service_role;

revoke update (
  id, agent_id, owner_user_id, proposal_id, grantee_kind, grantee_id, purpose, scopes,
  content_sha256, based_on_version, consent_event_id, consent_nonce_hash,
  runtime_attestation, consented_at, expires_at, attestation_verified, created_at
) on public.zhi_agent_cognition_consents from service_role;

grant update (revoked_at)
  on public.zhi_agent_cognition_consents to service_role;

commit;

-- Provisioning is administrator-only and never committed:
-- INSERT INTO zhi_security.gateway_secrets(secret_name, secret_value)
-- VALUES ('agent_consent_gateway_hmac', convert_to('<same 32+ byte random secret as Edge Function secret>', 'UTF8'));
-- Register public Ed25519 JWKs through a separate audited admin workflow; never store private JWK material.
