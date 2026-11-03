begin;
select plan(12);

select ok(to_regclass('public.zhi_system_logs') is not null, 'system audit log table exists');
select ok(to_regclass('public.zhi_agent_cognition_consents') is not null, 'Agent cognition consent table exists');
select ok(to_regclass('public.zhi_governance_authorizations') is not null, 'governance authorization table exists');
select ok(to_regclass('public.zhi_governance_interventions') is not null, 'governance intervention table exists');

select ok((select relrowsecurity from pg_class where oid='public.zhi_system_logs'::regclass), 'system logs RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.zhi_agent_cognition_consents'::regclass), 'cognition consent RLS enabled');
select ok(not has_table_privilege('anon','public.zhi_system_logs','select'), 'anon cannot read system logs');
select ok(not has_table_privilege('authenticated','public.zhi_agent_cognition_consents','select'), 'authenticated cannot read consent proofs');

select ok(exists(select 1 from pg_trigger where tgname='zhi_agent_cognition_records_append_only' and not tgisinternal), 'cognition append-only trigger exists');
select ok(exists(select 1 from pg_trigger where tgname='zhi_cognition_revision_proposals_integrity' and not tgisinternal), 'proposal integrity trigger exists');
select ok(exists(select 1 from pg_trigger where tgname='zhi_agent_cognition_consents_integrity' and not tgisinternal), 'consent integrity trigger exists');
select ok(not has_function_privilege('anon','public.zhi_rollback_cognition_version(uuid,uuid,uuid,text)','execute'), 'anon cannot invoke legacy direct rollback');

select * from finish();
rollback;
