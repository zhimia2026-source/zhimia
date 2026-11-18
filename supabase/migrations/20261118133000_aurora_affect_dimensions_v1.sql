-- AURORA multidimensional affect schema v1.
-- Applied to production with MCP execute_sql before this migration was committed.

alter table public.zhi_agent_affect_states
  add column if not exists dimension_schema_version text not null default 'aurora.affect.v1';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.zhi_agent_affect_states'::regclass
      and conname = 'zhi_agent_affect_states_schema_version_check'
  ) then
    alter table public.zhi_agent_affect_states
      add constraint zhi_agent_affect_states_schema_version_check
      check (dimension_schema_version = 'aurora.affect.v1');
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.zhi_agent_affect_states'::regclass
      and conname = 'zhi_agent_affect_states_current_state_object_check'
  ) then
    alter table public.zhi_agent_affect_states
      add constraint zhi_agent_affect_states_current_state_object_check
      check (jsonb_typeof(current_state) = 'object');
  end if;
end $$;

create or replace function public.zhi_record_affect_event(
  p_owner_user_id uuid,
  p_agent_id uuid,
  p_world_id uuid,
  p_event_kind text,
  p_source_kind text,
  p_source_ref text,
  p_idempotency_key text,
  p_occurred_at timestamp with time zone,
  p_appraisal jsonb,
  p_affect_before jsonb,
  p_affect_after jsonb,
  p_affect_delta jsonb,
  p_confidence double precision,
  p_evidence_kind text
)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_event public.zhi_agent_affect_events%rowtype;
  v_inserted boolean := false;
  v_schema_version text;
begin
  v_schema_version := coalesce(p_affect_after->>'schema_version', 'aurora.affect.v1');
  if v_schema_version <> 'aurora.affect.v1' then
    raise exception 'unsupported_affect_schema_version';
  end if;

  insert into public.zhi_agent_affect_events (
    owner_user_id, agent_id, world_id, event_kind, source_kind, source_ref,
    idempotency_key, occurred_at, appraisal, affect_before, affect_after,
    affect_delta, confidence, evidence_kind
  ) values (
    p_owner_user_id, p_agent_id, p_world_id, p_event_kind, p_source_kind, p_source_ref,
    p_idempotency_key, coalesce(p_occurred_at, now()), coalesce(p_appraisal,'{}'::jsonb),
    coalesce(p_affect_before,'{}'::jsonb), coalesce(p_affect_after,'{}'::jsonb),
    coalesce(p_affect_delta,'{}'::jsonb), p_confidence, p_evidence_kind
  )
  on conflict (owner_user_id, agent_id, idempotency_key) do nothing
  returning * into v_event;

  if found then
    v_inserted := true;
    insert into public.zhi_agent_affect_states (
      owner_user_id, agent_id, current_state, dimension_schema_version,
      state_version, last_event_id, last_event_at, updated_at
    ) values (
      p_owner_user_id, p_agent_id, coalesce(p_affect_after,'{}'::jsonb), v_schema_version,
      1, v_event.id, v_event.occurred_at, now()
    )
    on conflict (owner_user_id, agent_id) do update
      set current_state = excluded.current_state,
          dimension_schema_version = excluded.dimension_schema_version,
          state_version = public.zhi_agent_affect_states.state_version + 1,
          last_event_id = excluded.last_event_id,
          last_event_at = excluded.last_event_at,
          updated_at = now()
      where public.zhi_agent_affect_states.last_event_at is null
         or excluded.last_event_at >= public.zhi_agent_affect_states.last_event_at;
  else
    select * into v_event
    from public.zhi_agent_affect_events
    where owner_user_id = p_owner_user_id
      and agent_id = p_agent_id
      and idempotency_key = p_idempotency_key;
  end if;

  return jsonb_build_object(
    'event_id', v_event.id,
    'inserted', v_inserted,
    'occurred_at', v_event.occurred_at
  );
end;
$function$;

revoke all on function public.zhi_record_affect_event(uuid,uuid,uuid,text,text,text,text,timestamptz,jsonb,jsonb,jsonb,jsonb,double precision,text) from public, anon, authenticated;
grant execute on function public.zhi_record_affect_event(uuid,uuid,uuid,text,text,text,text,timestamptz,jsonb,jsonb,jsonb,jsonb,double precision,text) to service_role;
