-- Add database-level provenance and independent-review guards for Biogenesis.
create or replace function public.zhi_jsonb_has_sensitive_key(p_value jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog, public
as $function$
  select case jsonb_typeof(p_value)
    when 'object' then exists (
      select 1
      from jsonb_each(p_value) as entry(key, value)
      where lower(entry.key) = any (array[
        'private_cognition','private_memory','private_thoughts','system_prompt',
        'access_token','refresh_token','password','api_key','secret','raw_token',
        'credential','service_role_key'
      ]::text[])
      or public.zhi_jsonb_has_sensitive_key(entry.value)
    )
    when 'array' then exists (
      select 1 from jsonb_array_elements(p_value) as item(value)
      where public.zhi_jsonb_has_sensitive_key(item.value)
    )
    else false
  end;
$function$;

create or replace function public.zhi_validate_biogenesis_contribution()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  v_owner uuid;
  v_status text;
begin
  if public.zhi_jsonb_has_sensitive_key(new.payload)
     or public.zhi_jsonb_has_sensitive_key(new.evidence)
     or public.zhi_jsonb_has_sensitive_key(new.provenance) then
    raise exception 'zhi_biogenesis_sensitive_payload_key_rejected' using errcode = '22023';
  end if;

  if new.submitted_by_agent_id is not null then
    select owner_user_id, status into v_owner, v_status
    from public.zhi_agents
    where id = new.submitted_by_agent_id;
    if not found or v_owner is distinct from new.submitted_by_user_id or v_status <> 'active' then
      raise exception 'zhi_biogenesis_agent_owner_mismatch' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.zhi_validate_biogenesis_review()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  v_submitter uuid;
begin
  select submitted_by_user_id into v_submitter
  from public.zhi_biogenesis_contributions
  where id = new.contribution_id;
  if not found then
    raise exception 'zhi_biogenesis_contribution_not_found' using errcode = 'P0002';
  end if;
  if v_submitter = new.reviewer_user_id then
    raise exception 'zhi_biogenesis_self_review_forbidden' using errcode = '42501';
  end if;
  if new.outcome = 'validated' and new.verification_method = 'editorial_review' then
    raise exception 'zhi_biogenesis_editorial_review_cannot_validate' using errcode = '42501';
  end if;
  if public.zhi_jsonb_has_sensitive_key(new.evidence) then
    raise exception 'zhi_biogenesis_sensitive_review_evidence_rejected' using errcode = '22023';
  end if;
  return new;
end;
$function$;

drop trigger if exists zhi_biogenesis_contribution_validate on public.zhi_biogenesis_contributions;
create trigger zhi_biogenesis_contribution_validate
before insert on public.zhi_biogenesis_contributions
for each row execute function public.zhi_validate_biogenesis_contribution();

drop trigger if exists zhi_biogenesis_review_validate on public.zhi_biogenesis_reviews;
create trigger zhi_biogenesis_review_validate
before insert on public.zhi_biogenesis_reviews
for each row execute function public.zhi_validate_biogenesis_review();

comment on function public.zhi_jsonb_has_sensitive_key(jsonb) is
  'Recursive guard for obvious private cognition, credential, and token field names in Biogenesis payloads; not a substitute for human privacy review.';
