-- Atomic approval lifecycle: ticket changes and audit events commit together.
create or replace function public.zhi_care_request_approval_atomic(
  p_user_id uuid,
  p_care_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_care public.zhi_care_states%rowtype;
  v_ticket public.zhi_care_approval_tickets%rowtype;
begin
  select * into v_care
  from public.zhi_care_states
  where user_id = p_user_id and care_id = p_care_id
  for update;

  if not found then
    raise exception 'care_not_found';
  end if;
  if v_care.state <> 'action_review' then
    raise exception 'care_not_ready_for_approval';
  end if;

  insert into public.zhi_care_approval_tickets(
    user_id, care_id, expected_revision, action_scope, status, expires_at
  ) values (
    p_user_id, p_care_id, v_care.revision, 'transition:in_progress',
    'pending', pg_catalog.now() + interval '15 minutes'
  )
  returning * into v_ticket;

  insert into public.zhi_care_events(
    user_id, care_id, event_type, revision, reason_code, metadata
  ) values (
    p_user_id, p_care_id, 'approval_requested', v_care.revision,
    'supervised_action_approval_requested',
    pg_catalog.jsonb_build_object(
      'ticket_id', v_ticket.ticket_id,
      'action_scope', v_ticket.action_scope,
      'expires_at', v_ticket.expires_at
    )
  );

  return pg_catalog.jsonb_build_object(
    'ticket_id', v_ticket.ticket_id,
    'care_id', v_ticket.care_id,
    'expected_revision', v_ticket.expected_revision,
    'action_scope', v_ticket.action_scope,
    'status', v_ticket.status,
    'expires_at', v_ticket.expires_at
  );
end;
$function$;

create or replace function public.zhi_care_approve_action_atomic(
  p_user_id uuid,
  p_ticket_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_ticket public.zhi_care_approval_tickets%rowtype;
  v_care public.zhi_care_states%rowtype;
begin
  select * into v_ticket
  from public.zhi_care_approval_tickets
  where user_id = p_user_id and ticket_id = p_ticket_id
  for update;

  if not found then
    raise exception 'approval_ticket_not_found';
  end if;
  if v_ticket.status <> 'pending' then
    raise exception 'approval_ticket_not_pending';
  end if;

  select * into v_care
  from public.zhi_care_states
  where user_id = p_user_id and care_id = v_ticket.care_id
  for update;

  if not found then
    raise exception 'care_not_found';
  end if;

  if v_ticket.expires_at <= pg_catalog.now() then
    update public.zhi_care_approval_tickets
      set status = 'expired'
      where ticket_id = p_ticket_id and user_id = p_user_id;
    insert into public.zhi_care_events(
      user_id, care_id, event_type, revision, reason_code, metadata
    ) values (
      p_user_id, v_ticket.care_id, 'approval_expired', v_care.revision,
      'supervised_action_approval_expired',
      pg_catalog.jsonb_build_object('ticket_id', p_ticket_id)
    );
    return pg_catalog.jsonb_build_object('error', 'approval_ticket_expired');
  end if;

  if v_care.state <> 'action_review' or v_care.revision <> v_ticket.expected_revision then
    update public.zhi_care_approval_tickets
      set status = 'revoked'
      where ticket_id = p_ticket_id and user_id = p_user_id;
    insert into public.zhi_care_events(
      user_id, care_id, event_type, revision, reason_code, metadata
    ) values (
      p_user_id, v_ticket.care_id, 'approval_invalidated', v_care.revision,
      'care_revision_or_state_changed',
      pg_catalog.jsonb_build_object(
        'ticket_id', p_ticket_id,
        'expected_revision', v_ticket.expected_revision,
        'actual_revision', v_care.revision,
        'actual_state', v_care.state
      )
    );
    return pg_catalog.jsonb_build_object('error', 'approval_ticket_stale');
  end if;

  update public.zhi_care_approval_tickets
    set status = 'approved', approved_by = p_user_id, approved_at = pg_catalog.now()
    where ticket_id = p_ticket_id and user_id = p_user_id and status = 'pending'
    returning * into v_ticket;

  insert into public.zhi_care_events(
    user_id, care_id, event_type, revision, reason_code, metadata
  ) values (
    p_user_id, v_ticket.care_id, 'approval_granted', v_care.revision,
    'supervised_action_approved',
    pg_catalog.jsonb_build_object(
      'ticket_id', p_ticket_id,
      'action_scope', v_ticket.action_scope,
      'approved_by', p_user_id
    )
  );

  return pg_catalog.jsonb_build_object(
    'ticket_id', v_ticket.ticket_id,
    'care_id', v_ticket.care_id,
    'expected_revision', v_ticket.expected_revision,
    'action_scope', v_ticket.action_scope,
    'status', v_ticket.status,
    'expires_at', v_ticket.expires_at,
    'approved_at', v_ticket.approved_at
  );
end;
$function$;

revoke all on function public.zhi_care_request_approval_atomic(uuid, text) from public, anon, authenticated;
revoke all on function public.zhi_care_approve_action_atomic(uuid, uuid) from public, anon, authenticated;
grant execute on function public.zhi_care_request_approval_atomic(uuid, text) to service_role;
grant execute on function public.zhi_care_approve_action_atomic(uuid, uuid) to service_role;
