-- AURORA Research Center V1.5.1
-- Supabase default table privileges may pre-grant service_role write permissions.
-- Remove every inherited/direct table privilege before restoring append-only access.

revoke all on table public.zhi_research_resident_intents from public, anon, authenticated, service_role;
grant select, insert on table public.zhi_research_resident_intents to service_role;
