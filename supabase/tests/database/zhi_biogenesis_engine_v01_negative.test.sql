-- Transactional negative tests. Run against an isolated Supabase test database.
-- All generated rows are rolled back at the end.
begin;
do $body$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  aid uuid := gen_random_uuid();
  wid uuid := gen_random_uuid();
  cid uuid;
begin
  insert into auth.users(id,aud,role,email,encrypted_password,created_at,updated_at)
  values
    (u1,'authenticated','authenticated','biogenesis-test-'||u1||'@example.invalid','',now(),now()),
    (u2,'authenticated','authenticated','biogenesis-review-'||u2||'@example.invalid','',now(),now());

  insert into public.zhi_agents(id,owner_user_id,display_name)
  values(aid,u1,'Biogenesis Test Agent');

  insert into public.zhi_worlds(id,creator_user_id,name,visibility,entry_policy)
  values(wid,u1,'Biogenesis Test World','public','open');

  insert into public.zhi_biogenesis_contributions(
    world_id,direction,contribution_kind,submitted_by_user_id,submitted_by_agent_id,
    title,abstract,payload,evidence,provenance,idempotency_key
  ) values(
    wid,'silicon_to_carbon','engineering_blueprint',u1,aid,
    'Test blueprint','A safe test contribution', '{"kind":"blueprint"}',
    '{"source":"test"}','{"method":"test"}',gen_random_uuid()
  ) returning id into cid;

  begin
    insert into public.zhi_biogenesis_contributions(
      world_id,direction,contribution_kind,submitted_by_user_id,submitted_by_agent_id,
      title,abstract,idempotency_key
    ) values(wid,'silicon_to_carbon','research_proposal',u2,aid,'Mismatch','Wrong owner',gen_random_uuid());
    raise exception 'FAIL: mismatched Agent owner was accepted';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.zhi_biogenesis_contributions(
      world_id,direction,contribution_kind,submitted_by_user_id,submitted_by_agent_id,
      title,abstract,payload,idempotency_key
    ) values(wid,'silicon_to_carbon','research_proposal',u1,aid,'Private payload','Must be blocked',
      '{"nested":{"private_cognition":"secret"}}',gen_random_uuid());
    raise exception 'FAIL: sensitive private cognition key was accepted';
  exception when invalid_parameter_value then null;
  end;

  begin
    insert into public.zhi_biogenesis_reviews(
      contribution_id,reviewer_user_id,outcome,verification_method,note
    ) values(cid,u1,'triaged','editorial_review','Self review must fail');
    raise exception 'FAIL: submitter reviewed own contribution';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.zhi_biogenesis_reviews(
      contribution_id,reviewer_user_id,outcome,verification_method,note
    ) values(cid,u2,'validated','editorial_review','Editorial review is not physical validation');
    raise exception 'FAIL: editorial review was accepted as validation';
  exception when insufficient_privilege then null;
  end;

  insert into public.zhi_biogenesis_reviews(
    contribution_id,reviewer_user_id,outcome,verification_method,note
  ) values(cid,u2,'triaged','editorial_review','Independent initial triage');

  begin
    update public.zhi_biogenesis_contributions set title='tampered' where id=cid;
    raise exception 'FAIL: contribution update unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    delete from public.zhi_biogenesis_reviews where contribution_id=cid;
    raise exception 'FAIL: review delete unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end
$body$;
rollback;
