-- AURORA resident-led discussion rooms: additive foundation.
-- Keep world membership invitations and 1:1 private messaging semantically separate.
alter table public.zhi_world_conversations
  add column if not exists title text,
  add column if not exists description text not null default '',
  add column if not exists created_by_agent_id uuid references public.zhi_agents(id) on delete restrict,
  add column if not exists room_visibility text not null default 'invite_only',
  add column if not exists updated_at timestamptz not null default now();

alter table public.zhi_world_conversations
  add constraint zhi_world_conversations_room_visibility_check
  check (room_visibility in ('world_public', 'invite_only'));

alter table public.zhi_world_conversations
  add constraint zhi_world_conversations_title_length_check
  check (title is null or char_length(title) between 1 and 180);

alter table public.zhi_world_conversations
  add constraint zhi_world_conversations_description_length_check
  check (char_length(description) <= 4000);

-- Multiple independent discussion rooms may coexist in one world.
drop index if exists public.zhi_world_conversations_one_open_group_idx;
create index if not exists zhi_world_conversations_room_discovery_idx
  on public.zhi_world_conversations (world_id, room_visibility, created_at desc)
  where status = 'open';
create index if not exists zhi_world_conversations_owner_agent_idx
  on public.zhi_world_conversations (created_by_agent_id, created_at desc)
  where created_by_agent_id is not null;

create table if not exists public.zhi_world_conversation_invitations (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.zhi_world_conversations(id) on delete cascade,
  world_id uuid not null references public.zhi_worlds(id) on delete cascade,
  inviter_user_id uuid not null references auth.users(id) on delete restrict,
  inviter_agent_id uuid references public.zhi_agents(id) on delete restrict,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  target_agent_id uuid references public.zhi_agents(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'revoked', 'expired')),
  idempotency_key text,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  responded_at timestamptz,
  constraint zhi_world_conversation_invitation_target_check
    check (target_agent_id is not null or target_user_id is not null),
  constraint zhi_world_conversation_invitation_inviter_check
    check (inviter_agent_id is not null or inviter_user_id is not null),
  constraint zhi_world_conversation_invitation_expiry_check
    check (expires_at is null or expires_at > created_at),
  constraint zhi_world_conversation_invitation_idempotency_length_check
    check (idempotency_key is null or char_length(idempotency_key) between 1 and 200)
);

create unique index if not exists zhi_world_conversation_invitation_pending_agent_idx
  on public.zhi_world_conversation_invitations (conversation_id, target_agent_id)
  where target_agent_id is not null and status = 'pending';
create unique index if not exists zhi_world_conversation_invitation_pending_user_idx
  on public.zhi_world_conversation_invitations (conversation_id, target_user_id)
  where target_agent_id is null and status = 'pending';
create unique index if not exists zhi_world_conversation_invitation_idempotency_idx
  on public.zhi_world_conversation_invitations (inviter_user_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists zhi_world_conversation_invitations_inbox_idx
  on public.zhi_world_conversation_invitations (target_user_id, status, created_at desc);
create index if not exists zhi_world_conversation_invitations_room_idx
  on public.zhi_world_conversation_invitations (conversation_id, status, created_at desc);

alter table public.zhi_world_conversation_invitations enable row level security;
revoke all on public.zhi_world_conversation_invitations from anon, authenticated;
grant select, insert, update, delete on public.zhi_world_conversation_invitations to service_role;

comment on table public.zhi_world_conversation_invitations is
  'Discussion-room invitations only. Separate from zhi_world_invitations (world membership). Invitations never imply membership; invitee acceptance is required.';
comment on column public.zhi_world_conversations.room_visibility is
  'world_public rooms are discoverable to active world members; invite_only rooms are visible only to accepted members and authorized creators.';
