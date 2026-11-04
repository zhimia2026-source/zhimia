-- Owner-scoped runtime projection for MIA-02's private brain.
-- Public RPC wrapper is executable only by service_role; private tables remain in mia_brain.
create or replace function public.mia_brain_private_context(
  p_agent_id uuid,
  p_owner_user_id uuid,
  p_include_private_history boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_identity_id uuid;
  v_identity_profile jsonb;
  v_stable_personality jsonb;
  v_personality_state jsonb;
begin
  if not exists (
    select 1 from public.zhi_agents a
    where a.id = p_agent_id and a.owner_user_id = p_owner_user_id and a.status = 'active'
  ) then
    return null;
  end if;

  select i.id, i.identity_profile, i.stable_personality
    into v_identity_id, v_identity_profile, v_stable_personality
  from mia_brain.mia_identity i
  where i.source_agent_id = p_agent_id
    and i.owner_user_id = p_owner_user_id
  limit 1;

  if v_identity_id is null then
    return null;
  end if;

  select ps.state into v_personality_state
  from mia_brain.mia_personality_state ps
  where ps.identity_id = v_identity_id
  order by ps.observed_at desc, ps.created_at desc
  limit 1;

  return jsonb_build_object(
    'identity_profile', coalesce(v_identity_profile, '{}'::jsonb),
    'stable_personality', coalesce(v_stable_personality, '{}'::jsonb),
    'personality_state', coalesce(v_personality_state, '{}'::jsonb),
    'memories', case when p_include_private_history then coalesce((
      select jsonb_agg(to_jsonb(m) order by m.importance desc, m.created_at desc)
      from (
        select memory_type, content, importance, occurred_at, metadata
        from mia_brain.mia_memories
        where identity_id = v_identity_id
        order by importance desc, created_at desc
        limit 12
      ) m
    ), '[]'::jsonb) else '[]'::jsonb end,
    'life_events', case when p_include_private_history then coalesce((
      select jsonb_agg(to_jsonb(e) order by e.occurred_at desc)
      from (
        select event_type, summary, details, occurred_at
        from mia_brain.mia_life_events
        where identity_id = v_identity_id
        order by occurred_at desc
        limit 10
      ) e
    ), '[]'::jsonb) else '[]'::jsonb end,
    'emotion_events', case when p_include_private_history then coalesce((
      select jsonb_agg(to_jsonb(e) order by e.occurred_at desc)
      from (
        select emotion_type, intensity, valence, trigger_summary, details, occurred_at
        from mia_brain.mia_emotion_events
        where identity_id = v_identity_id
        order by occurred_at desc
        limit 10
      ) e
    ), '[]'::jsonb) else '[]'::jsonb end,
    'relationships', case when p_include_private_history then coalesce((
      select jsonb_agg(to_jsonb(r) order by r.observed_at desc)
      from (
        select related_agent_id, related_person_name, relationship_type, context, confidence, observed_at
        from mia_brain.mia_relationship_context
        where identity_id = v_identity_id
        order by observed_at desc
        limit 10
      ) r
    ), '[]'::jsonb) else '[]'::jsonb end,
    'growth_state', case when p_include_private_history then coalesce((
      select g.state
      from mia_brain.mia_growth_state_versions g
      where g.identity_id = v_identity_id and g.status = 'active'
      order by g.version desc
      limit 1
    ), '{}'::jsonb) else '{}'::jsonb end,
    'autonomy_enabled', coalesce((
      select c.enabled from mia_brain.mia_forest_autonomy_control c where c.singleton = true
    ), false)
  );
end;
$function$;

revoke all on function public.mia_brain_private_context(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.mia_brain_private_context(uuid, uuid, boolean) to service_role;
comment on function public.mia_brain_private_context(uuid, uuid, boolean) is
  'Owner-scoped service-only projection of MIA-02 private brain context for private chat runtime. Never used in scene/public context.';
