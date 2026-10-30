\set ON_ERROR_STOP on

INSERT INTO auth.users (id)
VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222'),
  ('33333333-3333-4333-8333-333333333333');

DO $$
DECLARE
  v_result jsonb;
  v_scene_id uuid;
  v_owner_count integer;
BEGIN
  v_result := public.zhi_create_world_with_owner(
    '11111111-1111-4111-8111-111111111111',
    'CI Atomic Scene',
    'Disposable migration smoke test',
    'public',
    'open'
  );

  v_scene_id := (v_result #>> '{scene,id}')::uuid;

  IF v_result #>> '{membership}' <> 'owner' THEN
    RAISE EXCEPTION 'RPC did not return owner membership';
  END IF;

  SELECT count(*) INTO v_owner_count
  FROM public.zhi_world_memberships
  WHERE world_id = v_scene_id
    AND principal_user_id = '11111111-1111-4111-8111-111111111111'
    AND membership_role = 'owner'
    AND status = 'active';

  IF v_owner_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one active owner membership, got %', v_owner_count;
  END IF;

  IF has_function_privilege('anon', 'public.zhi_create_world_with_owner(uuid,text,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute scene creation RPC';
  END IF;

  IF has_function_privilege('authenticated', 'public.zhi_create_world_with_owner(uuid,text,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must not execute scene creation RPC';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.zhi_create_world_with_owner(uuid,text,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must execute scene creation RPC';
  END IF;
END;
$$;

-- Force the second insert to fail and prove the first insert rolls back too.
CREATE FUNCTION public.zhi_test_reject_membership_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'injected_membership_failure';
END;
$$;

CREATE TRIGGER zhi_test_reject_membership_insert
BEFORE INSERT ON public.zhi_world_memberships
FOR EACH ROW EXECUTE FUNCTION public.zhi_test_reject_membership_insert();

DO $$
DECLARE
  v_before integer;
  v_after integer;
BEGIN
  SELECT count(*) INTO v_before
  FROM public.zhi_worlds
  WHERE name = 'CI Rollback Probe';

  BEGIN
    PERFORM public.zhi_create_world_with_owner(
      '11111111-1111-4111-8111-111111111111',
      'CI Rollback Probe',
      'This scene must not survive a failed owner insert',
      'public',
      'open'
    );
    RAISE EXCEPTION 'Expected injected membership failure was not raised';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Expected injected membership failure was not raised' THEN
      RAISE;
    END IF;
    IF SQLERRM <> 'injected_membership_failure' THEN
      RAISE;
    END IF;
  END;

  SELECT count(*) INTO v_after
  FROM public.zhi_worlds
  WHERE name = 'CI Rollback Probe';

  IF v_after <> v_before THEN
    RAISE EXCEPTION 'Atomic rollback failed: scene row was left behind';
  END IF;
END;
$$;

DROP TRIGGER zhi_test_reject_membership_insert ON public.zhi_world_memberships;
DROP FUNCTION public.zhi_test_reject_membership_insert();

-- Validate key schema invariants without depending on application credentials.
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.zhi_worlds'::regclass) THEN
    RAISE EXCEPTION 'RLS must be enabled on zhi_worlds';
  END IF;

  IF has_table_privilege('anon', 'public.zhi_world_messages', 'SELECT') THEN
    RAISE EXCEPTION 'anon must not directly read community messages';
  END IF;
END;
$$;

-- Invitation target binding, one-time consumption, and private-scene checks.
DO $$
DECLARE
  v_scene_id uuid;
  v_result jsonb;
  v_token_hash text := repeat('a', 64);
  v_invitation_id uuid;
BEGIN
  v_result := public.zhi_create_world_with_owner(
    '11111111-1111-4111-8111-111111111111',
    'CI Private Scene',
    'Private invitation test',
    'private',
    'invite_only'
  );
  v_scene_id := (v_result #>> '{scene,id}')::uuid;

  v_result := public.zhi_issue_world_invitation(
    v_scene_id,
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    v_token_hash,
    now() + interval '1 hour'
  );
  v_invitation_id := (v_result ->> 'invitation_id')::uuid;

  IF has_function_privilege('anon', 'public.zhi_issue_world_invitation(uuid,uuid,uuid,text,timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute invitation issue RPC';
  END IF;
  IF has_function_privilege('authenticated', 'public.zhi_redeem_world_invitation(text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must not execute invitation redeem RPC';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.zhi_redeem_world_invitation(text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must execute invitation redeem RPC';
  END IF;

  BEGIN
    PERFORM public.zhi_redeem_world_invitation(v_token_hash, '33333333-3333-4333-8333-333333333333');
    RAISE EXCEPTION 'wrong invitation target was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'wrong invitation target was accepted' THEN RAISE; END IF;
    IF SQLERRM <> 'invitation_target_mismatch' THEN RAISE; END IF;
  END;

  v_result := public.zhi_redeem_world_invitation(v_token_hash, '22222222-2222-4222-8222-222222222222');
  IF v_result ->> 'membership' <> 'active' THEN
    RAISE EXCEPTION 'invitation redemption did not create active membership';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.zhi_world_memberships
    WHERE world_id = v_scene_id
      AND principal_user_id = '22222222-2222-4222-8222-222222222222'
      AND agent_id IS NULL AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'redeemed invitation did not create membership';
  END IF;

  BEGIN
    PERFORM public.zhi_redeem_world_invitation(v_token_hash, '22222222-2222-4222-8222-222222222222');
    RAISE EXCEPTION 'invitation was redeemed twice';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'invitation was redeemed twice' THEN RAISE; END IF;
    IF SQLERRM <> 'invitation_unavailable' THEN RAISE; END IF;
  END;

  IF NOT EXISTS (
    SELECT 1 FROM public.zhi_world_invitations
    WHERE id = v_invitation_id AND used_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'invitation was not marked consumed';
  END IF;

  -- An expired invitation must never create or restore membership.
  INSERT INTO public.zhi_world_invitations (
    world_id, created_by_user_id, target_user_id, token_hash, expires_at
  ) VALUES (
    v_scene_id,
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    repeat('b', 64),
    now() - interval '1 minute'
  );

  BEGIN
    PERFORM public.zhi_redeem_world_invitation(repeat('b', 64), '22222222-2222-4222-8222-222222222222');
    RAISE EXCEPTION 'expired invitation was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'expired invitation was accepted' THEN RAISE; END IF;
    IF SQLERRM <> 'invitation_unavailable' THEN RAISE; END IF;
  END;
END;
$$;



-- Private cognition records must bind the agent to its actual owner.
INSERT INTO public.zhi_agents (id, owner_user_id, display_name, role)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Agent A', 'manager'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'Agent B', 'manager');

INSERT INTO public.zhi_agent_cognition_records (
  owner_user_id, agent_id, object_type, object_id, state,
  evidence_kind, source_ids, confidence, event_time
) VALUES (
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'world', 'forest-1', '{"weather":"rain"}',
  'observation', ARRAY['event-1'], 0.9, now()
);

DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.zhi_agent_cognition_records'::regclass) THEN
    RAISE EXCEPTION 'RLS must be enabled on private cognition records';
  END IF;
  IF has_table_privilege('anon', 'public.zhi_agent_cognition_records', 'SELECT')
     OR has_table_privilege('authenticated', 'public.zhi_agent_cognition_records', 'SELECT') THEN
    RAISE EXCEPTION 'browser roles must not directly read private cognition records';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.zhi_agent_cognition_records', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.zhi_agent_cognition_records', 'INSERT') THEN
    RAISE EXCEPTION 'service_role must mediate private cognition access';
  END IF;

  -- A mismatched owner/agent pair must fail at the composite foreign key.
  BEGIN
    INSERT INTO public.zhi_agent_cognition_records (
      owner_user_id, agent_id, object_type, object_id, state,
      evidence_kind, source_ids, confidence
    ) VALUES (
      '22222222-2222-4222-8222-222222222222',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'self', 'spoofed-agent', '{}',
      'observation', ARRAY['test-source'], 0.8
    );
    RAISE EXCEPTION 'cross-owner cognition insert was accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;

  -- Unknown must not acquire fabricated confidence.
  BEGIN
    INSERT INTO public.zhi_agent_cognition_records (
      owner_user_id, agent_id, object_type, object_id, state,
      evidence_kind, source_ids, confidence
    ) VALUES (
      '11111111-1111-4111-8111-111111111111',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'self', 'invalid-unknown', '{}',
      'unknown', '{}', 0.5
    );
    RAISE EXCEPTION 'unknown cognition record accepted fabricated confidence';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END;
$$;


-- Persistent cognition proposals are owner-scoped, evidence-linked, and shadow-only.
DO $$
DECLARE
  v_hypothesis_id uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  v_feedback_id uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  v_result jsonb;
  v_proposal_id uuid;
  v_link_count integer;
BEGIN
  INSERT INTO public.zhi_agent_cognition_records (
    id, owner_user_id, agent_id, object_type, object_id, state,
    evidence_kind, source_ids, confidence, inferred_at, hypothesis,
    prediction, version
  ) VALUES (
    v_hypothesis_id,
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'world', 'forest-1', '{"weather":"rain"}',
    'hypothesis', ARRAY['forecast-source'], 0.7, now(),
    'Rain may begin soon', 'Rain within one hour', 2
  );

  INSERT INTO public.zhi_agent_cognition_records (
    id, owner_user_id, agent_id, object_type, object_id, state,
    relation_ids, evidence_kind, source_ids, confidence, event_time
  ) VALUES (
    v_feedback_id,
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'feedback', 'forest-1',
    jsonb_build_object('hypothesis_id', v_hypothesis_id::text, 'observed_outcome', 'No rain'),
    ARRAY[v_hypothesis_id::text], 'observation', ARRAY['weather-observation'],
    0.95, now()
  );

  v_result := public.zhi_create_cognition_revision_proposal(
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    v_hypothesis_id,
    ARRAY[v_feedback_id],
    '{"weather_expectation":"lower_confidence"}'::jsonb
  );
  v_proposal_id := (v_result ->> 'id')::uuid;

  IF v_result ->> 'status' <> 'shadow_proposed'
     OR v_result ->> 'requires_human_review' <> 'true' THEN
    RAISE EXCEPTION 'revision proposal must remain pending human review';
  END IF;

  SELECT count(*) INTO v_link_count
  FROM public.zhi_cognition_revision_proposal_feedback
  WHERE proposal_id = v_proposal_id
    AND owner_user_id = '11111111-1111-4111-8111-111111111111'
    AND agent_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    AND feedback_record_id = v_feedback_id;
  IF v_link_count <> 1 THEN
    RAISE EXCEPTION 'proposal evidence link missing';
  END IF;

  IF has_table_privilege('anon', 'public.zhi_cognition_revision_proposals', 'SELECT')
     OR has_table_privilege('authenticated', 'public.zhi_cognition_revision_proposals', 'SELECT') THEN
    RAISE EXCEPTION 'browser roles must not directly read private revision proposals';
  END IF;
  IF has_function_privilege('anon', 'public.zhi_create_cognition_revision_proposal(uuid,uuid,uuid,uuid[],jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.zhi_create_cognition_revision_proposal(uuid,uuid,uuid,uuid[],jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'browser roles must not execute proposal persistence RPC';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.zhi_create_cognition_revision_proposal(uuid,uuid,uuid,uuid[],jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must execute proposal persistence RPC';
  END IF;

  -- A caller cannot attach another principal's base record to a proposal.
  BEGIN
    PERFORM public.zhi_create_cognition_revision_proposal(
      '22222222-2222-4222-8222-222222222222',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      v_hypothesis_id,
      ARRAY[v_feedback_id],
      '{"spoofed":true}'::jsonb
    );
    RAISE EXCEPTION 'cross-owner proposal was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'cross-owner proposal was accepted' THEN RAISE; END IF;
    IF SQLERRM <> 'base_record_not_found' THEN RAISE; END IF;
  END;
END;
$$;


-- Explicit owner approval creates an immutable next version; rollback appends another version.
DO $$
DECLARE
  v_hypothesis_id uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  v_feedback_id uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  v_proposal_id uuid;
  v_result jsonb;
  v_approved_record_id uuid;
  v_rollback_record_id uuid;
  v_stale_proposal_id uuid;
BEGIN
  SELECT id INTO v_proposal_id
  FROM public.zhi_cognition_revision_proposals
  WHERE owner_user_id = '11111111-1111-4111-8111-111111111111'
    AND agent_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    AND based_on_record_id = v_hypothesis_id
    AND status = 'shadow_proposed'
  ORDER BY created_at
  LIMIT 1;

  IF v_proposal_id IS NULL THEN
    RAISE EXCEPTION 'expected pending proposal for approval test';
  END IF;

  v_result := public.zhi_decide_cognition_revision_proposal(
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    v_proposal_id,
    true,
    'Approved in disposable CI'
  );
  IF v_result ->> 'status' <> 'approved' THEN
    RAISE EXCEPTION 'owner approval did not approve proposal';
  END IF;
  v_approved_record_id := (v_result #>> '{record,id}')::uuid;

  IF (v_result #>> '{record,version}')::integer <> 3
     OR v_result #>> '{record,change_kind}' <> 'approved_revision'
     OR v_result #>> '{record,previous_record_id}' <> v_hypothesis_id::text
     OR v_result #>> '{record,source_proposal_id}' <> v_proposal_id::text THEN
    RAISE EXCEPTION 'approved revision metadata or version chain is invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.zhi_agent_cognition_records
    WHERE id = v_hypothesis_id AND version = 2
      AND state = '{"weather":"rain"}'::jsonb
  ) THEN
    RAISE EXCEPTION 'approval must not mutate the previous cognition record';
  END IF;

  v_result := public.zhi_rollback_cognition_version(
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    v_hypothesis_id,
    'Restore prior state in disposable CI'
  );
  IF v_result ->> 'status' <> 'rolled_back' THEN
    RAISE EXCEPTION 'rollback RPC did not return rolled_back';
  END IF;
  v_rollback_record_id := (v_result #>> '{record,id}')::uuid;

  IF (v_result #>> '{record,version}')::integer <> 4
     OR v_result #>> '{record,change_kind}' <> 'rollback'
     OR v_result #>> '{record,previous_record_id}' <> v_approved_record_id::text
     OR (v_result #> '{record,state}') <> '{"weather":"rain"}'::jsonb
     OR v_result #>> '{record,change_note}' <> 'Restore prior state in disposable CI' THEN
    RAISE EXCEPTION 'rollback did not append a correct restored snapshot with durable audit note';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.zhi_agent_cognition_records
    WHERE id = v_approved_record_id
      AND change_note = 'Approved in disposable CI'
      AND change_kind = 'approved_revision'
  ) THEN
    RAISE EXCEPTION 'approved revision decision note was not persisted in version history';
  END IF;

  -- A proposal based on the old version cannot overwrite a newer current version.
  v_result := public.zhi_create_cognition_revision_proposal(
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    v_hypothesis_id,
    ARRAY[v_feedback_id],
    '{"weather_expectation":"stale_change"}'::jsonb
  );
  v_stale_proposal_id := (v_result ->> 'id')::uuid;

  v_result := public.zhi_decide_cognition_revision_proposal(
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    v_stale_proposal_id,
    true,
    'Must be rejected as stale'
  );
  IF v_result ->> 'status' <> 'stale' THEN
    RAISE EXCEPTION 'stale proposal was not rejected';
  END IF;

  IF has_function_privilege('anon', 'public.zhi_decide_cognition_revision_proposal(uuid,uuid,uuid,boolean,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.zhi_rollback_cognition_version(uuid,uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'browser roles must not execute revision decision or rollback RPCs';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.zhi_decide_cognition_revision_proposal(uuid,uuid,uuid,boolean,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.zhi_rollback_cognition_version(uuid,uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must execute revision decision and rollback RPCs';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.zhi_agent_cognition_records WHERE id = v_approved_record_id)
     OR NOT EXISTS (SELECT 1 FROM public.zhi_agent_cognition_records WHERE id = v_rollback_record_id) THEN
    RAISE EXCEPTION 'version history must remain append-only';
  END IF;
END;
$$;
