-- Supervised one-time approval tickets for CareState transition to in_progress.
create table if not exists public.zhi_care_approval_tickets (
 ticket_id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 care_id text not null,
 expected_revision integer not null check (expected_revision > 0),
 action_scope text not null check (action_scope = 'transition:in_progress'),
 status text not null default 'pending' check (status in ('pending','approved','consumed','expired','revoked')),
 expires_at timestamptz not null,
 approved_by uuid references auth.users(id) on delete set null,
 approved_at timestamptz, consumed_at timestamptz,
 created_at timestamptz not null default pg_catalog.now(),
 foreign key (user_id, care_id) references public.zhi_care_states(user_id, care_id) on delete cascade
);
create index if not exists zhi_care_approval_tickets_owner_idx on public.zhi_care_approval_tickets(user_id,care_id,status,expires_at);
alter table public.zhi_care_approval_tickets enable row level security;
revoke all on public.zhi_care_approval_tickets from public,anon,authenticated;
grant select,insert,update,delete on public.zhi_care_approval_tickets to service_role;

create or replace function public.zhi_care_transition_atomic(
 p_user_id uuid,p_care_id text,p_expected_revision integer,p_from_state text,p_to_state text,p_reason_code text,p_ticket_id uuid default null
) returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare v_row public.zhi_care_states%rowtype; v_ticket public.zhi_care_approval_tickets%rowtype;
begin
 if p_to_state='in_progress' then
  if p_ticket_id is null then raise exception 'approved_ticket_required'; end if;
  update public.zhi_care_approval_tickets set status='consumed',consumed_at=pg_catalog.now()
   where ticket_id=p_ticket_id and user_id=p_user_id and care_id=p_care_id and expected_revision=p_expected_revision
    and action_scope='transition:in_progress' and status='approved' and expires_at>pg_catalog.now()
   returning * into v_ticket;
  if not found then raise exception 'approved_ticket_invalid_or_expired'; end if;
 end if;
 update public.zhi_care_states set state=p_to_state,revision=revision+1,updated_at=pg_catalog.now()
  where user_id=p_user_id and care_id=p_care_id and revision=p_expected_revision and state=p_from_state
  returning * into v_row;
 if not found then raise exception 'care_revision_conflict'; end if;
 insert into public.zhi_care_events(user_id,care_id,event_type,from_state,to_state,revision,reason_code,metadata)
 values(v_row.user_id,v_row.care_id,
  case when p_to_state='paused' then 'paused' when p_to_state='terminated' then 'terminated' else 'state_transition' end,
  p_from_state,p_to_state,v_row.revision,p_reason_code,
  case when p_to_state='in_progress' then pg_catalog.jsonb_build_object('approval_ticket_id',p_ticket_id) else '{}'::jsonb end);
 return pg_catalog.to_jsonb(v_row);
end; $$;

revoke all on function public.zhi_care_transition_atomic(uuid,text,integer,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.zhi_care_transition_atomic(uuid,text,integer,text,text,text,uuid) to service_role;

-- Remove the legacy six-argument overload so it cannot bypass the ticket requirement.
drop function if exists public.zhi_care_transition_atomic(uuid,text,integer,text,text,text);
