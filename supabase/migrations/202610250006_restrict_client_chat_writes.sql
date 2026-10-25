-- Keep chat persistence behind the authenticated Edge Function so the
-- server can enforce explicit chat-storage consent before writing health text.
-- The Edge Function uses the server-only service_role client; it does not rely
-- on these end-user INSERT grants.
revoke insert on table public.zhi_health_conversations from anon, authenticated;
revoke insert on table public.zhi_health_messages from anon, authenticated;

-- Defense in depth: the browser must never write assistant messages directly.
-- Existing RLS policies remain in place for user-scoped SELECT/UPDATE/DELETE.
