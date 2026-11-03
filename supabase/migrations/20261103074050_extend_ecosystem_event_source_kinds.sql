-- Align ecosystem event producer source kinds with both database guards.
-- This migration is additive and preserves the service-role-only access model.

alter table public.zhi_ecosystem_events
  drop constraint zhi_ecosystem_events_source_kind_check;

alter table public.zhi_ecosystem_events
  add constraint zhi_ecosystem_events_source_kind_check
  check (source_kind = any (array[
    'natural_process',
    'environmental_event',
    'scheduled_event',
    'agent_action',
    'system',
    'material_process',
    'biogeochemical_process',
    'life_cycle_process'
  ]::text[]));

do $migration$
declare
  v_definition text;
  v_old text := 'not in (''natural_process'',''environmental_event'',''scheduled_event'',''agent_action'',''system'')';
  v_new text := 'not in (''natural_process'',''environmental_event'',''scheduled_event'',''agent_action'',''system'',''material_process'',''biogeochemical_process'',''life_cycle_process'')';
begin
  select pg_get_functiondef(
    'public.zhi_ecosystem_commit_tick(uuid,bigint,timestamp with time zone,jsonb,jsonb,boolean)'::regprocedure
  ) into v_definition;

  if position(v_old in v_definition) = 0 then
    raise exception 'expected_source_kind_whitelist_not_found';
  end if;

  v_definition := replace(v_definition, v_old, v_new);
  execute v_definition;
end
$migration$;
