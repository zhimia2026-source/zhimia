-- ZHI Constitutional Protection V0.1 hardening
-- Close the legacy cognition rollback path until it is routed through Agent-consented proposals.

create or replace function public.zhi_rollback_cognition_version(
  p_owner_user_id uuid,
  p_agent_id uuid,
  p_target_record_id uuid,
  p_decision_note text default null
)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  raise exception 'zhi_rollback_requires_agent_consented_revision_proposal'
    using errcode = '42501';
end;
$function$;

alter table public.zhi_governance_authorizations
  drop constraint if exists zhi_governance_authorizations_status_acceptance_check;
alter table public.zhi_governance_authorizations
  add constraint zhi_governance_authorizations_status_acceptance_check
  check (
    (status = 'pending_acceptance' and accepted_by_agent = false and revoked_at is null)
    or (status = 'active' and accepted_by_agent = true and accepted_at is not null and revoked_at is null)
    or (status = 'revoked' and revoked_at is not null)
    or (status = 'expired')
  );

create or replace function public.zhi_guard_governance_intervention()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  v_auth public.zhi_governance_authorizations%rowtype;
  v_log public.zhi_system_logs%rowtype;
begin
  if tg_op = 'DELETE' then
    raise exception 'zhi_governance_interventions_are_append_only' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    select * into v_auth
    from public.zhi_governance_authorizations
    where id = new.authorization_id
    for share;

    if not found
       or v_auth.status <> 'active'
       or not v_auth.accepted_by_agent
       or v_auth.category <> 'risk_intervention'
       or v_auth.decision_mode <> 'limited_execute_and_review'
       or v_auth.actor_agent_id <> new.actor_agent_id
       or v_auth.world_id <> new.world_id
       or v_auth.action <> new.action
       or (v_auth.expires_at is not null and v_auth.expires_at <= now())
       or (v_auth.target_type is not null and v_auth.target_type <> new.target_type)
       or (v_auth.target_id is not null and v_auth.target_id <> new.target_id) then
      raise exception 'zhi_risk_intervention_authorization_invalid' using errcode = '42501';
    end if;

    select * into v_log
    from public.zhi_system_logs
    where id = new.audit_log_id
      and event_type = 'governance.risk_intervention.requested'
      and actor_agent_id = new.actor_agent_id
      and world_id = new.world_id
      and target_type = new.target_type
      and target_id = new.target_id
      and result = 'review_required';

    if not found then
      raise exception 'zhi_risk_intervention_audit_event_required' using errcode = '42501';
    end if;

    if new.status <> 'review_required' then
      raise exception 'zhi_risk_intervention_must_start_in_review' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.authorization_id is distinct from old.authorization_id
     or new.actor_agent_id is distinct from old.actor_agent_id
     or new.world_id is distinct from old.world_id
     or new.action is distinct from old.action
     or new.target_type is distinct from old.target_type
     or new.target_id is distinct from old.target_id
     or new.reason_code is distinct from old.reason_code
     or new.reason_summary is distinct from old.reason_summary
     or new.audit_log_id is distinct from old.audit_log_id
     or new.applied_at is distinct from old.applied_at
     or new.expires_at is distinct from old.expires_at
     or new.review_due_at is distinct from old.review_due_at then
    raise exception 'zhi_governance_intervention_scope_immutable' using errcode = '42501';
  end if;

  if old.status <> 'review_required' or new.status not in ('confirmed','lifted','expired') then
    raise exception 'zhi_governance_intervention_transition_invalid' using errcode = '42501';
  end if;

  if new.status in ('confirmed','lifted')
     and (new.reviewed_at is null or new.reviewed_by_user_id is null) then
    raise exception 'zhi_governance_intervention_review_required' using errcode = '42501';
  end if;

  return new;
end;
$function$;

drop trigger if exists zhi_governance_interventions_integrity on public.zhi_governance_interventions;
create trigger zhi_governance_interventions_integrity
before insert or update or delete on public.zhi_governance_interventions
for each row execute function public.zhi_guard_governance_intervention();

revoke all on function public.zhi_guard_governance_intervention() from public, anon, authenticated;

comment on function public.zhi_rollback_cognition_version(uuid,uuid,uuid,text) is
  'Disabled for constitutional protection: rollback must be expressed as a revision proposal and receive Agent consent before application.';
