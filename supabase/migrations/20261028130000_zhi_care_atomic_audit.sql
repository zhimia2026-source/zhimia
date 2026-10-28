-- Atomic CareState mutation + audit event. Each function call is one PostgreSQL transaction.
-- Functions are callable only by service_role; Edge Function validates the user token first.
create or replace function public.zhi_care_transition_atomic(
  p_user_id uuid, p_care_id text, p_expected_revision integer,
  p_from_state text, p_to_state text, p_reason_code text
) returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare v_row public.zhi_care_states%rowtype;
begin
  update public.zhi_care_states set state=p_to_state, revision=revision+1, updated_at=pg_catalog.now()
   where user_id=p_user_id and care_id=p_care_id and revision=p_expected_revision and state=p_from_state
   returning * into v_row;
  if not found then return null; end if;
  insert into public.zhi_care_events(user_id,care_id,event_type,from_state,to_state,revision,reason_code,metadata)
  values(v_row.user_id,v_row.care_id,
    case when p_to_state='paused' then 'paused' when p_to_state='terminated' then 'terminated' else 'state_transition' end,
    p_from_state,p_to_state,v_row.revision,p_reason_code,'{}'::jsonb);
  return pg_catalog.to_jsonb(v_row);
end; $$;

create or replace function public.zhi_care_add_evidence_atomic(
  p_user_id uuid, p_care_id text, p_expected_revision integer, p_evidence jsonb, p_epistemic_status text
) returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare v_row public.zhi_care_states%rowtype;
begin
  update public.zhi_care_states set evidence_refs=evidence_refs||pg_catalog.jsonb_build_array(p_evidence),
    epistemic_status=p_epistemic_status, revision=revision+1, updated_at=pg_catalog.now()
   where user_id=p_user_id and care_id=p_care_id and revision=p_expected_revision
     and pg_catalog.jsonb_array_length(evidence_refs)<200
   returning * into v_row;
  if not found then
    if exists(select 1 from public.zhi_care_states where user_id=p_user_id and care_id=p_care_id
      and revision=p_expected_revision and pg_catalog.jsonb_array_length(evidence_refs)>=200) then
      raise exception 'evidence_limit_reached';
    end if;
    return null;
  end if;
  insert into public.zhi_care_events(user_id,care_id,event_type,revision,reason_code,metadata)
  values(v_row.user_id,v_row.care_id,'evidence_added',v_row.revision,'evidence_reference_added',
    pg_catalog.jsonb_build_object('evidence_ref',p_evidence->>'ref','epistemic_status',p_evidence->>'status'));
  return pg_catalog.to_jsonb(v_row);
end; $$;

revoke all on function public.zhi_care_transition_atomic(uuid,text,integer,text,text,text) from public,anon,authenticated;
revoke all on function public.zhi_care_add_evidence_atomic(uuid,text,integer,jsonb,text) from public,anon,authenticated;
grant execute on function public.zhi_care_transition_atomic(uuid,text,integer,text,text,text) to service_role;
grant execute on function public.zhi_care_add_evidence_atomic(uuid,text,integer,jsonb,text) to service_role;
