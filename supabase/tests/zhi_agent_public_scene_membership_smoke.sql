begin;

insert into auth.users(id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');

insert into public.zhi_agents(id, owner_user_id, display_name, role, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','Agent A','manager','active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','Agent B','manager','active');

insert into public.zhi_worlds(id, creator_user_id, name, description, visibility, entry_policy, status) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','22222222-2222-4222-8222-222222222222','Public test','', 'public','open','open'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','22222222-2222-4222-8222-222222222222','Private test','', 'private','invite_only','open'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','22222222-2222-4222-8222-222222222222','Paused test','', 'public','open','paused');

insert into public.zhi_world_memberships (
  world_id, principal_user_id, agent_id, membership_role, status, capabilities
) values (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  '22222222-2222-4222-8222-222222222222',
  null, 'owner', 'active',
  array['scene:manage','message:read','message:send']::text[]
);

set local role service_role;

do $$
declare
  v_result jsonb;
  v_count integer;
  v_membership public.zhi_world_memberships%rowtype;
begin
  v_result := public.zhi_join_public_world_agent(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  if v_result->>'membership' <> 'active' or v_result->>'idempotent_replay' <> 'false' then
    raise exception 'first_agent_join_result_invalid';
  end if;

  v_result := public.zhi_join_public_world_agent(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  if v_result->>'idempotent_replay' <> 'true' then raise exception 'agent_join_not_idempotent'; end if;

  select count(*) into v_count from public.zhi_world_memberships
  where world_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    and principal_user_id = '11111111-1111-4111-8111-111111111111'
    and agent_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  if v_count <> 1 then raise exception 'duplicate_agent_membership'; end if;

  select * into v_membership from public.zhi_world_memberships
  where world_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    and principal_user_id = '11111111-1111-4111-8111-111111111111'
    and agent_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  if v_membership.capabilities <> array['message:read','message:send']::text[]
     or v_membership.membership_role <> 'member' then
    raise exception 'agent_privileges_not_least_privilege';
  end if;

  begin
    perform public.zhi_join_public_world_agent(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      '22222222-2222-4222-8222-222222222222',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    );
    raise exception 'cross_owner_join_should_fail';
  exception when sqlstate '42501' then null;
  end;

  begin
    perform public.zhi_join_public_world_agent(
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      '11111111-1111-4111-8111-111111111111',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    );
    raise exception 'private_scene_join_should_fail';
  exception when sqlstate '22023' then null;
  end;

  begin
    perform public.zhi_join_public_world_agent(
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      '11111111-1111-4111-8111-111111111111',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    );
    raise exception 'paused_scene_join_should_fail';
  exception when sqlstate '22023' then null;
  end;

  v_result := public.zhi_revoke_agent_world_membership(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  if v_result->>'membership' <> 'revoked' then raise exception 'agent_revoke_failed'; end if;

  select * into v_membership from public.zhi_world_memberships
  where world_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    and principal_user_id = '11111111-1111-4111-8111-111111111111'
    and agent_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  if v_membership.status <> 'revoked' or v_membership.revoked_at is null then
    raise exception 'agent_membership_not_revoked';
  end if;

  v_result := public.zhi_join_public_world_agent(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  if v_result->>'membership' <> 'active' then raise exception 'agent_rejoin_failed'; end if;

  if has_function_privilege('anon','public.zhi_join_public_world_agent(uuid,uuid,uuid)','EXECUTE')
     or has_function_privilege('authenticated','public.zhi_join_public_world_agent(uuid,uuid,uuid)','EXECUTE')
     or not has_function_privilege('service_role','public.zhi_join_public_world_agent(uuid,uuid,uuid)','EXECUTE') then
    raise exception 'agent_join_rpc_grants_invalid';
  end if;
  if has_function_privilege('anon','public.zhi_revoke_agent_world_membership(uuid,uuid,uuid)','EXECUTE')
     or has_function_privilege('authenticated','public.zhi_revoke_agent_world_membership(uuid,uuid,uuid)','EXECUTE')
     or not has_function_privilege('service_role','public.zhi_revoke_agent_world_membership(uuid,uuid,uuid)','EXECUTE') then
    raise exception 'agent_revoke_rpc_grants_invalid';
  end if;
end;
$$;


do $agent_invite_smoke$
declare
  v_result jsonb;
  v_count integer;
  v_membership public.zhi_world_memberships%rowtype;
begin
  v_result := public.zhi_issue_world_agent_invitation(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    '22222222-2222-4222-8222-222222222222',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    repeat('a',64),
    now() + interval '2 days'
  );
  if v_result->>'target_agent_id' <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' then
    raise exception 'agent_invitation_target_not_bound';
  end if;

  begin
    perform public.zhi_redeem_world_agent_invitation(
      repeat('a',64),
      '11111111-1111-4111-8111-111111111111',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    );
    raise exception 'wrong_agent_redemption_should_fail';
  exception when sqlstate '42501' then null;
  end;

  begin
    perform public.zhi_redeem_world_agent_invitation(
      repeat('a',64),
      '22222222-2222-4222-8222-222222222222',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    );
    raise exception 'wrong_owner_redemption_should_fail';
  exception when sqlstate '42501' then null;
  end;

  v_result := public.zhi_redeem_world_agent_invitation(
    repeat('a',64),
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  if v_result->>'membership' <> 'active' then raise exception 'agent_invitation_redeem_failed'; end if;

  select count(*) into v_count from public.zhi_world_memberships
  where world_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    and principal_user_id = '11111111-1111-4111-8111-111111111111'
    and agent_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    and status = 'active';
  if v_count <> 1 then raise exception 'private_agent_membership_missing'; end if;

  select * into v_membership from public.zhi_world_memberships
  where world_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    and principal_user_id = '11111111-1111-4111-8111-111111111111'
    and agent_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  if v_membership.capabilities <> array['message:read','message:send']::text[] then
    raise exception 'private_agent_privileges_not_minimal';
  end if;

  begin
    perform public.zhi_redeem_world_agent_invitation(
      repeat('a',64),
      '11111111-1111-4111-8111-111111111111',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    );
    raise exception 'agent_invitation_replay_should_fail';
  exception when sqlstate '22023' then null;
  end;

  insert into public.zhi_world_invitations(
    world_id, created_by_user_id, target_user_id, target_agent_id,
    token_hash, expires_at
  ) values (
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    '22222222-2222-4222-8222-222222222222',
    null, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    repeat('b',64), now() - interval '1 minute'
  );
  begin
    perform public.zhi_redeem_world_agent_invitation(
      repeat('b',64),
      '11111111-1111-4111-8111-111111111111',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    );
    raise exception 'expired_agent_invitation_should_fail';
  exception when sqlstate '22023' then null;
  end;

  if has_function_privilege('anon','public.zhi_issue_world_agent_invitation(uuid,uuid,uuid,text,timestamptz)','EXECUTE')
     or has_function_privilege('authenticated','public.zhi_issue_world_agent_invitation(uuid,uuid,uuid,text,timestamptz)','EXECUTE')
     or not has_function_privilege('service_role','public.zhi_issue_world_agent_invitation(uuid,uuid,uuid,text,timestamptz)','EXECUTE') then
    raise exception 'agent_invitation_issue_grants_invalid';
  end if;
  if has_function_privilege('anon','public.zhi_redeem_world_agent_invitation(text,uuid,uuid)','EXECUTE')
     or has_function_privilege('authenticated','public.zhi_redeem_world_agent_invitation(text,uuid,uuid)','EXECUTE')
     or not has_function_privilege('service_role','public.zhi_redeem_world_agent_invitation(text,uuid,uuid)','EXECUTE') then
    raise exception 'agent_invitation_redeem_grants_invalid';
  end if;
end;
$agent_invite_smoke$;

rollback;
