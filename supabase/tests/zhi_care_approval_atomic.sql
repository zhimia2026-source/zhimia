-- Rollback-only integration test for the Care approval lifecycle.
-- Run with the Supabase SQL editor or an administrative SQL connection.
-- Every synthetic row is rolled back; an existing auth.users row is used only as FK owner.
begin;
do $test$
declare
  v_user uuid;
  v_care_id text;
  v_ticket jsonb;
  v_result jsonb;
  v_ticket_id uuid;
  v_status text;
  v_count integer;
begin
  select id into v_user from auth.users order by created_at limit 1;
  if v_user is null then raise exception 'test_requires_existing_auth_user'; end if;

  -- Happy path: request -> approve -> consume, with one audit event per step.
  v_care_id := 'care-audit-test-' || pg_catalog.gen_random_uuid()::text;
  insert into public.zhi_care_states(user_id, care_id, target_ref, state, revision)
  values (v_user, v_care_id, 'test://care-audit', 'action_review', 5);
  v_ticket := public.zhi_care_request_approval_atomic(v_user, v_care_id);
  v_ticket_id := (v_ticket->>'ticket_id')::uuid;
  if v_ticket->>'status' <> 'pending' then raise exception 'request_status_assertion_failed'; end if;
  v_result := public.zhi_care_approve_action_atomic(v_user, v_ticket_id);
  if v_result->>'status' <> 'approved' then raise exception 'approval_status_assertion_failed'; end if;
  select count(*) into v_count from public.zhi_care_events
   where user_id=v_user and care_id=v_care_id
     and event_type in ('approval_requested','approval_granted');
  if v_count <> 2 then raise exception 'approval_audit_count_assertion_failed: %', v_count; end if;
  v_result := public.zhi_care_transition_atomic(
    v_user, v_care_id, 5, 'action_review', 'in_progress', 'test_supervised_transition', v_ticket_id
  );
  if v_result->>'state' <> 'in_progress' then raise exception 'transition_assertion_failed'; end if;
  if not exists(select 1 from public.zhi_care_approval_tickets where ticket_id=v_ticket_id and status='consumed') then
    raise exception 'ticket_consumption_assertion_failed';
  end if;
  select count(*) into v_count from public.zhi_care_events
   where user_id=v_user and care_id=v_care_id
     and event_type in ('approval_requested','approval_granted','state_transition');
  if v_count <> 3 then raise exception 'complete_audit_count_assertion_failed: %', v_count; end if;

  -- Expired tickets are marked expired and audited atomically.
  v_care_id := 'care-expired-test-' || pg_catalog.gen_random_uuid()::text;
  insert into public.zhi_care_states(user_id, care_id, target_ref, state, revision)
  values (v_user, v_care_id, 'test://expired', 'action_review', 2);
  v_ticket := public.zhi_care_request_approval_atomic(v_user, v_care_id);
  v_ticket_id := (v_ticket->>'ticket_id')::uuid;
  update public.zhi_care_approval_tickets set expires_at=pg_catalog.now()-interval '1 minute'
   where ticket_id=v_ticket_id;
  v_result := public.zhi_care_approve_action_atomic(v_user, v_ticket_id);
  if v_result->>'error' <> 'approval_ticket_expired' then raise exception 'expiry_result_assertion_failed'; end if;
  select status into v_status from public.zhi_care_approval_tickets where ticket_id=v_ticket_id;
  if v_status <> 'expired' then raise exception 'expiry_status_assertion_failed'; end if;
  if not exists(select 1 from public.zhi_care_events where care_id=v_care_id and event_type='approval_expired') then
    raise exception 'expiry_audit_assertion_failed';
  end if;

  -- A changed Care revision revokes the stale ticket and records why.
  v_care_id := 'care-stale-test-' || pg_catalog.gen_random_uuid()::text;
  insert into public.zhi_care_states(user_id, care_id, target_ref, state, revision)
  values (v_user, v_care_id, 'test://stale', 'action_review', 4);
  v_ticket := public.zhi_care_request_approval_atomic(v_user, v_care_id);
  v_ticket_id := (v_ticket->>'ticket_id')::uuid;
  update public.zhi_care_states set revision=revision+1 where user_id=v_user and care_id=v_care_id;
  v_result := public.zhi_care_approve_action_atomic(v_user, v_ticket_id);
  if v_result->>'error' <> 'approval_ticket_stale' then raise exception 'stale_result_assertion_failed'; end if;
  select status into v_status from public.zhi_care_approval_tickets where ticket_id=v_ticket_id;
  if v_status <> 'revoked' then raise exception 'stale_status_assertion_failed'; end if;
  if not exists(select 1 from public.zhi_care_events where care_id=v_care_id and event_type='approval_invalidated') then
    raise exception 'stale_audit_assertion_failed';
  end if;
end;
$test$;
rollback;
