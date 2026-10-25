-- ZHI Health Advisor MVP schema
-- Apply only to the clean ZHIMIA project after reviewing this file.
create extension if not exists pgcrypto;

create table public.zhi_health_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '健康生活咨询' check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.zhi_health_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 12000),
  certainty_level text check (certainty_level in ('L0', 'L1', 'L2', 'L3')),
  evidence_basis jsonb not null default '[]'::jsonb,
  limitations text[] not null default '{}',
  safety_override boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (conversation_id, user_id)
    references public.zhi_health_conversations(id, user_id) on delete cascade,
  unique (user_id, request_id, role)
);

create index zhi_health_messages_conversation_time_idx
  on public.zhi_health_messages (user_id, conversation_id, created_at);

create table public.zhi_health_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('chat_storage', 'health_memory')),
  policy_version text not null,
  granted boolean not null,
  granted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, purpose, policy_version),
  unique (id, user_id),
  check ((granted = true and granted_at is not null and revoked_at is null)
      or (granted = false and revoked_at is not null))
);

create table public.zhi_health_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  consent_id uuid not null,
  memory_kind text not null check (memory_kind in ('preference', 'health_goal', 'confirmed_plan', 'user_correction')),
  content text not null check (char_length(content) between 1 and 2000),
  source_kind text not null check (source_kind in ('user_report', 'professional_confirmed', 'verified_document')),
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'user_confirmed', 'professionally_confirmed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  foreign key (consent_id, user_id)
    references public.zhi_health_consents(id, user_id) on delete restrict
);

create index zhi_health_memories_user_time_idx
  on public.zhi_health_memories (user_id, created_at desc);

create table public.zhi_health_audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in (
    'chat_completed', 'safety_override', 'model_unavailable',
    'consent_granted', 'consent_revoked', 'memory_created', 'memory_deleted'
  )),
  resource_type text,
  resource_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index zhi_health_audit_user_time_idx
  on public.zhi_health_audit_events (user_id, created_at desc);

alter table public.zhi_health_conversations enable row level security;
alter table public.zhi_health_messages enable row level security;
alter table public.zhi_health_consents enable row level security;
alter table public.zhi_health_memories enable row level security;
alter table public.zhi_health_audit_events enable row level security;

revoke all on public.zhi_health_conversations from anon, authenticated;
revoke all on public.zhi_health_messages from anon, authenticated;
revoke all on public.zhi_health_consents from anon, authenticated;
revoke all on public.zhi_health_memories from anon, authenticated;
revoke all on public.zhi_health_audit_events from anon, authenticated;
grant usage on schema public to authenticated;

grant select, insert, update, delete on public.zhi_health_conversations to authenticated;
grant select, insert on public.zhi_health_messages to authenticated;
grant select, insert, update on public.zhi_health_consents to authenticated;
grant select, delete on public.zhi_health_memories to authenticated;
grant select on public.zhi_health_audit_events to authenticated;

create policy "zhi_health_conversations_select_own"
  on public.zhi_health_conversations for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "zhi_health_conversations_insert_own"
  on public.zhi_health_conversations for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "zhi_health_conversations_update_own"
  on public.zhi_health_conversations for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "zhi_health_conversations_delete_own"
  on public.zhi_health_conversations for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "zhi_health_messages_select_own"
  on public.zhi_health_messages for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "zhi_health_messages_insert_user_message_own"
  on public.zhi_health_messages for insert to authenticated
  with check ((select auth.uid()) = user_id and role = 'user');

create policy "zhi_health_consents_select_own"
  on public.zhi_health_consents for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "zhi_health_consents_insert_own"
  on public.zhi_health_consents for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and ((granted = true and granted_at is not null and revoked_at is null)
      or (granted = false and revoked_at is not null))
  );
create policy "zhi_health_consents_update_own"
  on public.zhi_health_consents for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "zhi_health_memories_select_own"
  on public.zhi_health_memories for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "zhi_health_memories_delete_own"
  on public.zhi_health_memories for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "zhi_health_audit_select_own"
  on public.zhi_health_audit_events for select to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.zhi_health_memories is
  'Private health-support memories. Writes are server-controlled and must require explicit health_memory consent.';
comment on table public.zhi_health_audit_events is
  'Minimal audit metadata only. Do not store message text, diagnoses, medication details, or other health content here.';
