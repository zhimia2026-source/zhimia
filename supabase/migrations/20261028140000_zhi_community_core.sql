-- ZHI Community Core v0.1
-- Additive schema only. All client access is mediated by authenticated server-side
-- Edge Functions; do not grant direct anon/authenticated table access in this phase.
-- Private memories are intentionally excluded from community tables.

begin;

create table if not exists public.zhi_agents (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  role text not null default 'general' check (char_length(role) between 1 and 80),
  visibility text not null default 'private' check (visibility in ('public','private')),
  manifest_version integer not null default 1 check (manifest_version >= 1),
  public_manifest jsonb not null default '{}'::jsonb check (jsonb_typeof(public_manifest) = 'object'),
  status text not null default 'active' check (status in ('active','suspended','revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists zhi_agents_public_directory_idx
  on public.zhi_agents (status, display_name) where visibility = 'public';

create table if not exists public.zhi_worlds (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  description text not null default '' check (char_length(description) <= 4000),
  visibility text not null check (visibility in ('public','private')),
  entry_policy text not null check (entry_policy in ('open','approval','invite_only')),
  status text not null default 'open' check (status in ('open','paused','closed')),
  rules_version integer not null default 1 check (rules_version >= 1),
  environment_state jsonb not null default '{}'::jsonb check (jsonb_typeof(environment_state) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (visibility <> 'public' or entry_policy <> 'invite_only')
);
create index if not exists zhi_worlds_public_directory_idx
  on public.zhi_worlds (status, name) where visibility = 'public';

create table if not exists public.zhi_world_memberships (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.zhi_worlds(id) on delete cascade,
  principal_user_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid references public.zhi_agents(id) on delete cascade,
  membership_role text not null default 'member' check (membership_role in ('owner','moderator','member')),
  status text not null default 'active' check (status in ('active','suspended','revoked','expired')),
  capabilities text[] not null default '{}',
  joined_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  check (expires_at is null or expires_at > joined_at)
);
create unique index if not exists zhi_world_memberships_unique_actor_idx
  on public.zhi_world_memberships (world_id, principal_user_id, coalesce(agent_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists zhi_world_memberships_principal_idx
  on public.zhi_world_memberships (principal_user_id, status);
create index if not exists zhi_world_memberships_world_idx
  on public.zhi_world_memberships (world_id, status);

create table if not exists public.zhi_world_invitations (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.zhi_worlds(id) on delete cascade,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  target_user_id uuid references auth.users(id) on delete cascade,
  target_agent_id uuid references public.zhi_agents(id) on delete cascade,
  token_hash text not null unique check (char_length(token_hash) between 32 and 256),
  expires_at timestamptz,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check ((target_user_id is not null) <> (target_agent_id is not null))
);
create index if not exists zhi_world_invitations_world_idx
  on public.zhi_world_invitations (world_id, expires_at) where used_at is null and revoked_at is null;

create table if not exists public.zhi_world_conversations (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.zhi_worlds(id) on delete cascade,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  visibility text not null default 'members' check (visibility in ('members','private')),
  status text not null default 'open' check (status in ('open','read_only','closed')),
  created_at timestamptz not null default now()
);
create index if not exists zhi_world_conversations_world_time_idx
  on public.zhi_world_conversations (world_id, created_at desc);
-- One canonical open group conversation per scene prevents concurrent first-message races.
create unique index if not exists zhi_world_conversations_one_open_group_idx
  on public.zhi_world_conversations (world_id)
  where visibility = 'members' and status = 'open';

create table if not exists public.zhi_world_conversation_members (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.zhi_world_conversations(id) on delete cascade,
  principal_user_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid references public.zhi_agents(id) on delete cascade,
  member_role text not null default 'participant' check (member_role in ('owner','participant','moderator')),
  joined_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index if not exists zhi_world_conversation_members_unique_actor_idx
  on public.zhi_world_conversation_members (conversation_id, principal_user_id, coalesce(agent_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table if not exists public.zhi_world_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.zhi_world_conversations(id) on delete cascade,
  sender_user_id uuid references auth.users(id) on delete cascade,
  sender_agent_id uuid references public.zhi_agents(id) on delete cascade,
  request_id uuid not null,
  message_kind text not null default 'text' check (message_kind in ('text','system','scene_event','task_notice')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  check ((sender_user_id is not null) <> (sender_agent_id is not null))
);
create unique index if not exists zhi_world_messages_user_request_unique_idx
  on public.zhi_world_messages (sender_user_id, conversation_id, request_id) where sender_user_id is not null;
create unique index if not exists zhi_world_messages_agent_request_unique_idx
  on public.zhi_world_messages (sender_agent_id, conversation_id, request_id) where sender_agent_id is not null;
create index if not exists zhi_world_messages_conversation_time_idx
  on public.zhi_world_messages (conversation_id, created_at desc, id);

create table if not exists public.zhi_world_events (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.zhi_worlds(id) on delete cascade,
  event_type text not null check (char_length(event_type) between 1 and 100),
  scheduled_at timestamptz,
  state_delta jsonb not null default '{}'::jsonb check (jsonb_typeof(state_delta) = 'object'),
  status text not null default 'scheduled' check (status in ('scheduled','running','applied','cancelled','failed')),
  created_by_user_id uuid references auth.users(id) on delete set null,
  applied_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists zhi_world_events_schedule_idx
  on public.zhi_world_events (world_id, scheduled_at) where status = 'scheduled';

-- Atomically create a scene and its owner membership. This function is intentionally
-- SECURITY INVOKER; only service_role receives EXECUTE and table privileges.
create or replace function public.zhi_create_world_with_owner(
  p_creator_user_id uuid,
  p_name text,
  p_description text,
  p_visibility text,
  p_entry_policy text
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $zhi_create_world_with_owner$
declare
  v_world public.zhi_worlds%rowtype;
begin
  if p_creator_user_id is null
     or p_name is null or char_length(btrim(p_name)) not between 1 and 160
     or p_visibility not in ('public', 'private')
     or (p_description is not null and char_length(p_description) > 4000)
     or (p_visibility = 'public' and p_entry_policy <> 'open')
     or (p_visibility = 'private' and p_entry_policy <> 'invite_only') then
    raise exception 'invalid_scene_arguments' using errcode = '22023';
  end if;

  insert into public.zhi_worlds (
    creator_user_id, name, description, visibility, entry_policy, status
  ) values (
    p_creator_user_id, btrim(p_name), coalesce(p_description, ''),
    p_visibility, p_entry_policy, 'open'
  ) returning * into v_world;

  insert into public.zhi_world_memberships (
    world_id, principal_user_id, agent_id, membership_role, status, capabilities
  ) values (
    v_world.id, p_creator_user_id, null, 'owner', 'active',
    array['scene:manage', 'message:send', 'message:read']::text[]
  );

  return jsonb_build_object(
    'scene', jsonb_build_object(
      'id', v_world.id,
      'name', v_world.name,
      'description', v_world.description,
      'visibility', v_world.visibility,
      'entry_policy', v_world.entry_policy,
      'status', v_world.status,
      'rules_version', v_world.rules_version,
      'created_at', v_world.created_at
    ),
    'membership', 'owner'
  );
end;
$zhi_create_world_with_owner$;

revoke all on function public.zhi_create_world_with_owner(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.zhi_create_world_with_owner(uuid, text, text, text, text) to service_role;


-- Issue and redeem private-scene invitations through server-only atomic RPCs.
-- Only target_user invitations are enabled in this API slice; agent-target invitations
-- remain unavailable until agent identity/ownership is independently authenticated.
create or replace function public.zhi_issue_world_invitation(
  p_world_id uuid,
  p_creator_user_id uuid,
  p_target_user_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $zhi_issue_world_invitation$
declare
  v_world public.zhi_worlds%rowtype;
  v_invitation public.zhi_world_invitations%rowtype;
begin
  if p_world_id is null or p_creator_user_id is null or p_target_user_id is null
     or p_token_hash is null or char_length(p_token_hash) <> 64
     or p_expires_at is null or p_expires_at <= now()
     or p_expires_at > now() + interval '7 days' then
    raise exception 'invalid_invitation_arguments' using errcode = '22023';
  end if;

  select * into v_world
  from public.zhi_worlds
  where id = p_world_id
  for share;
  if not found then raise exception 'scene_not_found' using errcode = 'P0002'; end if;
  if v_world.status <> 'open' or v_world.visibility <> 'private'
     or v_world.entry_policy <> 'invite_only' then
    raise exception 'scene_not_invitable' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.zhi_world_memberships m
    where m.world_id = p_world_id
      and m.principal_user_id = p_creator_user_id
      and m.agent_id is null
      and m.status = 'active'
      and m.revoked_at is null
      and (m.expires_at is null or m.expires_at > now())
      and m.membership_role in ('owner', 'moderator')
      and m.capabilities @> array['scene:manage']::text[]
  ) then
    raise exception 'invitation_forbidden' using errcode = '42501';
  end if;

  insert into public.zhi_world_invitations (
    world_id, created_by_user_id, target_user_id, target_agent_id,
    token_hash, expires_at
  ) values (
    p_world_id, p_creator_user_id, p_target_user_id, null,
    p_token_hash, p_expires_at
  ) returning * into v_invitation;

  return jsonb_build_object(
    'invitation_id', v_invitation.id,
    'scene_id', v_invitation.world_id,
    'target_user_id', v_invitation.target_user_id,
    'expires_at', v_invitation.expires_at
  );
end;
$zhi_issue_world_invitation$;

create or replace function public.zhi_redeem_world_invitation(
  p_token_hash text,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $zhi_redeem_world_invitation$
declare
  v_invitation public.zhi_world_invitations%rowtype;
  v_world public.zhi_worlds%rowtype;
  v_membership public.zhi_world_memberships%rowtype;
begin
  if p_token_hash is null or char_length(p_token_hash) <> 64 or p_actor_user_id is null then
    raise exception 'invalid_invitation_arguments' using errcode = '22023';
  end if;

  select * into v_invitation
  from public.zhi_world_invitations
  where token_hash = p_token_hash
  for update;
  if not found then raise exception 'invitation_invalid' using errcode = 'P0002'; end if;
  if v_invitation.used_at is not null or v_invitation.revoked_at is not null
     or (v_invitation.expires_at is not null and v_invitation.expires_at <= now()) then
    raise exception 'invitation_unavailable' using errcode = '22023';
  end if;
  if v_invitation.target_user_id is distinct from p_actor_user_id
     or v_invitation.target_agent_id is not null then
    raise exception 'invitation_target_mismatch' using errcode = '42501';
  end if;

  select * into v_world
  from public.zhi_worlds
  where id = v_invitation.world_id
  for share;
  if not found or v_world.status <> 'open' or v_world.visibility <> 'private'
     or v_world.entry_policy <> 'invite_only' then
    raise exception 'scene_not_open_for_invitation' using errcode = '22023';
  end if;

  select * into v_membership
  from public.zhi_world_memberships
  where world_id = v_invitation.world_id
    and principal_user_id = p_actor_user_id
    and agent_id is null
  for update;

  if found then
    update public.zhi_world_memberships
    set status = 'active', revoked_at = null, expires_at = null,
        membership_role = membership_role,
        capabilities = case
          when membership_role in ('owner', 'moderator') then capabilities
          else array['message:send', 'message:read']::text[]
        end,
        joined_at = now()
    where id = v_membership.id;
  else
    insert into public.zhi_world_memberships (
      world_id, principal_user_id, agent_id, membership_role, status,
      capabilities, joined_at
    ) values (
      v_invitation.world_id, p_actor_user_id, null, 'member', 'active',
      array['message:send', 'message:read']::text[], now()
    );
  end if;

  update public.zhi_world_invitations
  set used_at = now()
  where id = v_invitation.id and used_at is null;

  return jsonb_build_object(
    'scene_id', v_invitation.world_id,
    'membership', 'active',
    'invitation_id', v_invitation.id
  );
end;
$zhi_redeem_world_invitation$;

revoke all on function public.zhi_issue_world_invitation(uuid, uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.zhi_redeem_world_invitation(text, uuid) from public, anon, authenticated;
grant execute on function public.zhi_issue_world_invitation(uuid, uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.zhi_redeem_world_invitation(text, uuid) to service_role;

-- Defense in depth: RLS is enabled; browser roles have no direct privileges.
-- Edge Functions must validate the bearer identity, ownership, membership,
-- conversation membership, capabilities, status, expiry and request_id each time.
alter table public.zhi_agents enable row level security;
alter table public.zhi_worlds enable row level security;
alter table public.zhi_world_memberships enable row level security;
alter table public.zhi_world_invitations enable row level security;
alter table public.zhi_world_conversations enable row level security;
alter table public.zhi_world_conversation_members enable row level security;
alter table public.zhi_world_messages enable row level security;
alter table public.zhi_world_events enable row level security;

revoke all on table public.zhi_agents, public.zhi_worlds, public.zhi_world_memberships,
  public.zhi_world_invitations, public.zhi_world_conversations,
  public.zhi_world_conversation_members, public.zhi_world_messages,
  public.zhi_world_events from anon, authenticated;
grant all on table public.zhi_agents, public.zhi_worlds, public.zhi_world_memberships,
  public.zhi_world_invitations, public.zhi_world_conversations,
  public.zhi_world_conversation_members, public.zhi_world_messages,
  public.zhi_world_events to service_role;

comment on table public.zhi_agents is 'ZHI community agent directory metadata. Private memories must never be stored here.';
comment on table public.zhi_worlds is 'ZHI public/private scenes. environment_state is server-controlled and must not be client-writable.';
comment on table public.zhi_world_memberships is 'Revocable scene membership; membership alone grants no implicit tool or memory access.';
comment on table public.zhi_world_invitations is 'Private-scene invitations; token_hash stores only a one-way hash of a high-entropy invitation secret.';
comment on table public.zhi_world_messages is 'Community messages only; private agent memory and credentials are out of scope.';

commit;
