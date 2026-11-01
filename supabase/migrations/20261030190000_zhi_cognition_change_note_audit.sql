-- ZHI cognition change-note audit trail v0.1
-- Append-only version rows retain the human decision/rollback note.
begin;

alter table public.zhi_agent_cognition_records
  add column if not exists change_note text
  check (change_note is null or char_length(change_note) <= 2000);

create or replace function public.zhi_decide_cognition_revision_proposal(
  p_owner_user_id uuid,
  p_agent_id uuid,
  p_proposal_id uuid,
  p_approved boolean,
  p_decision_note text default null
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $zhi_decide_cognition_revision_proposal$
declare
  v_proposal public.zhi_cognition_revision_proposals%rowtype;
  v_latest public.zhi_agent_cognition_records%rowtype;
  v_new public.zhi_agent_cognition_records%rowtype;
begin
  if p_owner_user_id is null or p_agent_id is null or p_proposal_id is null
     or p_approved is null or (p_decision_note is not null and char_length(p_decision_note) > 2000) then
    raise exception 'invalid_revision_decision_arguments' using errcode = '22023';
  end if;
  perform 1 from public.zhi_agents
  where id = p_agent_id and owner_user_id = p_owner_user_id and status = 'active'
  for update;
  if not found then raise exception 'agent_not_found_or_inactive' using errcode = 'P0002'; end if;
  select * into v_proposal from public.zhi_cognition_revision_proposals
  where id = p_proposal_id and owner_user_id = p_owner_user_id and agent_id = p_agent_id
  for update;
  if not found then raise exception 'proposal_not_found' using errcode = 'P0002'; end if;
  if v_proposal.status <> 'shadow_proposed' then
    raise exception 'proposal_already_decided' using errcode = '22023';
  end if;
  if not p_approved then
    update public.zhi_cognition_revision_proposals
    set status = 'rejected', decided_at = now(), reviewer_user_id = p_owner_user_id,
        decision_note = p_decision_note
    where id = p_proposal_id returning * into v_proposal;
    return jsonb_build_object('status', 'rejected', 'proposal', to_jsonb(v_proposal));
  end if;
  select * into v_latest from public.zhi_agent_cognition_records
  where owner_user_id = p_owner_user_id and agent_id = p_agent_id
    and object_type = v_proposal.target_object_type and object_id = v_proposal.target_object_id
  order by version desc limit 1;
  if not found or v_latest.id <> v_proposal.based_on_record_id
     or v_latest.version <> v_proposal.based_on_version then
    update public.zhi_cognition_revision_proposals
    set status = 'stale', decided_at = now(), reviewer_user_id = p_owner_user_id,
        decision_note = coalesce(p_decision_note, 'base_version_changed')
    where id = p_proposal_id returning * into v_proposal;
    return jsonb_build_object('status', 'stale', 'proposal', to_jsonb(v_proposal));
  end if;
  insert into public.zhi_agent_cognition_records (
    owner_user_id, agent_id, object_type, object_id, state, relation_ids,
    evidence_kind, source_ids, confidence, event_time, recorded_at, inferred_at,
    hypothesis, prediction, version, change_kind, previous_record_id,
    source_proposal_id, change_note
  ) values (
    v_latest.owner_user_id, v_latest.agent_id, v_latest.object_type, v_latest.object_id,
    v_proposal.proposed_state, v_latest.relation_ids, v_latest.evidence_kind,
    v_latest.source_ids, v_latest.confidence, v_latest.event_time, now(),
    v_latest.inferred_at, v_latest.hypothesis, v_latest.prediction,
    v_latest.version + 1, 'approved_revision', v_latest.id, v_proposal.id, p_decision_note
  ) returning * into v_new;
  update public.zhi_cognition_revision_proposals
  set status = 'approved', decided_at = now(), reviewer_user_id = p_owner_user_id,
      decision_note = p_decision_note
  where id = p_proposal_id returning * into v_proposal;
  return jsonb_build_object('status', 'approved', 'proposal', to_jsonb(v_proposal), 'record', to_jsonb(v_new));
end;
$zhi_decide_cognition_revision_proposal$;

create or replace function public.zhi_rollback_cognition_version(
  p_owner_user_id uuid,
  p_agent_id uuid,
  p_target_record_id uuid,
  p_decision_note text default null
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $zhi_rollback_cognition_version$
declare
  v_latest public.zhi_agent_cognition_records%rowtype;
  v_target public.zhi_agent_cognition_records%rowtype;
  v_new public.zhi_agent_cognition_records%rowtype;
begin
  if p_owner_user_id is null or p_agent_id is null or p_target_record_id is null
     or (p_decision_note is not null and char_length(p_decision_note) > 2000) then
    raise exception 'invalid_rollback_arguments' using errcode = '22023';
  end if;
  perform 1 from public.zhi_agents
  where id = p_agent_id and owner_user_id = p_owner_user_id and status = 'active'
  for update;
  if not found then raise exception 'agent_not_found_or_inactive' using errcode = 'P0002'; end if;
  select * into v_target from public.zhi_agent_cognition_records
  where id = p_target_record_id and owner_user_id = p_owner_user_id and agent_id = p_agent_id;
  if not found then raise exception 'rollback_target_not_found' using errcode = 'P0002'; end if;
  select * into v_latest from public.zhi_agent_cognition_records
  where owner_user_id = p_owner_user_id and agent_id = p_agent_id
    and object_type = v_target.object_type and object_id = v_target.object_id
  order by version desc limit 1;
  if not found then raise exception 'current_version_not_found' using errcode = 'P0002'; end if;
  if v_target.version >= v_latest.version then
    raise exception 'rollback_target_must_be_older' using errcode = '22023';
  end if;
  insert into public.zhi_agent_cognition_records (
    owner_user_id, agent_id, object_type, object_id, state, relation_ids,
    evidence_kind, source_ids, confidence, event_time, recorded_at, inferred_at,
    hypothesis, prediction, version, change_kind, previous_record_id,
    source_proposal_id, change_note
  ) values (
    v_target.owner_user_id, v_target.agent_id, v_target.object_type, v_target.object_id,
    v_target.state, v_target.relation_ids, v_target.evidence_kind, v_target.source_ids,
    v_target.confidence, v_target.event_time, now(), v_target.inferred_at,
    v_target.hypothesis, v_target.prediction, v_latest.version + 1,
    'rollback', v_latest.id, null, p_decision_note
  ) returning * into v_new;
  return jsonb_build_object(
    'status', 'rolled_back', 'target_record_id', v_target.id,
    'previous_current_record_id', v_latest.id, 'record', to_jsonb(v_new),
    'decision_note', p_decision_note
  );
end;
$zhi_rollback_cognition_version$;

revoke all on function public.zhi_decide_cognition_revision_proposal(uuid,uuid,uuid,boolean,text) from public, anon, authenticated;
revoke all on function public.zhi_rollback_cognition_version(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.zhi_decide_cognition_revision_proposal(uuid,uuid,uuid,boolean,text) to service_role;
grant execute on function public.zhi_rollback_cognition_version(uuid,uuid,uuid,text) to service_role;

commit;
