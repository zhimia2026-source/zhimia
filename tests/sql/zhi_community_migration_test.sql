\set ON_ERROR_STOP on

INSERT INTO auth.users (id)
VALUES ('11111111-1111-4111-8111-111111111111');

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
