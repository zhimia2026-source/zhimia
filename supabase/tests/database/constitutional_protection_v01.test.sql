-- Read-only catalog assertions for the deployed constitutional protection schema.
do $$
begin
  if to_regclass('public.zhi_system_logs') is null then raise exception 'FAIL: system audit log table missing'; end if;
  if to_regclass('public.zhi_agent_cognition_consents') is null then raise exception 'FAIL: Agent cognition consent table missing'; end if;
  if to_regclass('public.zhi_governance_authorizations') is null then raise exception 'FAIL: governance authorization table missing'; end if;
  if to_regclass('public.zhi_governance_interventions') is null then raise exception 'FAIL: governance intervention table missing'; end if;

  if not (select relrowsecurity from pg_class where oid='public.zhi_system_logs'::regclass) then
    raise exception 'FAIL: system logs RLS disabled';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.zhi_agent_cognition_consents'::regclass) then
    raise exception 'FAIL: cognition consent RLS disabled';
  end if;
  if has_table_privilege('anon','public.zhi_system_logs','select') then
    raise exception 'FAIL: anon can read system logs';
  end if;
  if has_table_privilege('authenticated','public.zhi_agent_cognition_consents','select') then
    raise exception 'FAIL: authenticated can read consent proofs';
  end if;

  if not exists(select 1 from pg_trigger where tgname='zhi_agent_cognition_records_append_only' and not tgisinternal) then
    raise exception 'FAIL: cognition append-only trigger missing';
  end if;
  if not exists(select 1 from pg_trigger where tgname='zhi_cognition_revision_proposals_integrity' and not tgisinternal) then
    raise exception 'FAIL: proposal integrity trigger missing';
  end if;
  if not exists(select 1 from pg_trigger where tgname='zhi_agent_cognition_consents_integrity' and not tgisinternal) then
    raise exception 'FAIL: consent integrity trigger missing';
  end if;
  if has_function_privilege('anon','public.zhi_rollback_cognition_version(uuid,uuid,uuid,text)','execute') then
    raise exception 'FAIL: anon can invoke legacy direct rollback';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname='zhi_agent_cognition_consents_proposal_grantee_check'
      and conrelid='public.zhi_agent_cognition_consents'::regclass
  ) then
    raise exception 'FAIL: proposal consent grantee binding missing';
  end if;
  if position('attestation_verified = true' in pg_get_functiondef('public.zhi_guard_revision_proposal_integrity()'::regprocedure)) = 0 then
    raise exception 'FAIL: proposal application does not require verified Agent attestation';
  end if;
end $;

select 'PASS: ZHI constitutional protection catalog assertions (14)' as result;
