-- Performance indexes for the ZHI Health Advisor pilot.
create index if not exists zhi_health_conversations_user_id_idx
  on public.zhi_health_conversations (user_id);
create index if not exists zhi_health_messages_conversation_user_fk_idx
  on public.zhi_health_messages (conversation_id, user_id);
create index if not exists zhi_health_memories_consent_user_fk_idx
  on public.zhi_health_memories (consent_id, user_id);
