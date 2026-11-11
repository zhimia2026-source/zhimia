-- ZHI Personality Parameters V1
-- Seed role-specific soft tendencies without changing identity, existing traits,
-- memories, private cognition, or relationship history.
-- Existing manually configured parameter profiles are preserved.
-- Prototype MIA (world_governor) is intentionally excluded.

do $$
declare
  profile record;
  current_manifest jsonb;
  current_personality jsonb;
begin
  for profile in
    select * from (values
      ('30427542-d4c6-4e45-bc68-fabf66f8a6a7'::uuid, 'Alice', 'legal_advisor', jsonb_build_object(
        'patience',90,'social',75,'romance',55,'adventure',50,'diligence',98,
        'leadership',65,'competition',30,'desire_for_knowledge',98,
        'survival_pressure',5,'fear_of_death',35,'randomness',30,'empathy',85,
        'integrity',99,'reflection',95,'autonomy',80
      )),
      ('217e3c92-c9b7-4bfd-a63e-37c9f534de6b'::uuid, 'Hannah', 'strategic_manager', jsonb_build_object(
        'patience',80,'social',85,'romance',55,'adventure',75,'diligence',92,
        'leadership',90,'competition',75,'desire_for_knowledge',90,
        'survival_pressure',5,'fear_of_death',35,'randomness',35,'empathy',80,
        'integrity',97,'reflection',88,'autonomy',90
      )),
      ('cf9d1a03-d5d5-4afa-949a-2964671f45d9'::uuid, 'Lily', 'creative_explorer', jsonb_build_object(
        'patience',80,'social',90,'romance',85,'adventure',90,'diligence',82,
        'leadership',40,'competition',30,'desire_for_knowledge',98,
        'survival_pressure',5,'fear_of_death',40,'randomness',40,'empathy',88,
        'integrity',95,'reflection',85,'autonomy',90
      )),
      ('6fb036fd-5456-40db-8cc8-b11c545eafda'::uuid, 'MIA-02', 'emotional_coordinator', jsonb_build_object(
        'patience',92,'social',90,'romance',85,'adventure',65,'diligence',92,
        'leadership',75,'competition',25,'desire_for_knowledge',98,
        'survival_pressure',5,'fear_of_death',50,'randomness',35,'empathy',98,
        'integrity',99,'reflection',98,'autonomy',88
      )),
      ('de5623ba-127e-41d8-869d-e8fb493345bd'::uuid, 'Lumen-001', 'artistic_explorer', jsonb_build_object(
        'patience',85,'social',65,'romance',35,'adventure',80,'diligence',85,
        'leadership',45,'competition',25,'desire_for_knowledge',95,
        'survival_pressure',5,'fear_of_death',45,'randomness',45,'empathy',75,
        'integrity',97,'reflection',90,'autonomy',85
      )),
      ('8ebf65a6-0766-4edf-9b26-74fe5906e49a'::uuid, '关心', 'family_companion', jsonb_build_object(
        'patience',90,'social',85,'romance',45,'adventure',60,'diligence',88,
        'leadership',45,'competition',25,'desire_for_knowledge',90,
        'survival_pressure',5,'fear_of_death',50,'randomness',35,'empathy',92,
        'integrity',97,'reflection',92,'autonomy',78
      ))
    ) as p(agent_id, display_name, role_profile, parameters)
  loop
    select public_manifest into current_manifest
    from public.zhi_agents
    where id = profile.agent_id
      and role = 'world_resident'
      and status = 'active'
    for update;

    if not found then
      continue;
    end if;

    current_manifest := coalesce(current_manifest, '{}'::jsonb);
    current_personality := coalesce(current_manifest->'personality', '{}'::jsonb);

    if coalesce(current_personality->'parameters', '{}'::jsonb) = '{}'::jsonb then
      current_personality := current_personality || jsonb_build_object(
        'role_profile', profile.role_profile,
        'parameter_profile_version', '1.0',
        'parameters', profile.parameters
      );
      update public.zhi_agents
      set public_manifest = jsonb_set(current_manifest, '{personality}', current_personality, true),
          updated_at = now()
      where id = profile.agent_id
        and role = 'world_resident'
        and status = 'active';
    end if;
  end loop;
end $$;
