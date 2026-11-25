-- AURORA spatial/forest/strategy runtime tables are server-owned.
-- These tables intentionally have RLS enabled without client-facing policies.
-- Revoke table-level client grants as defense in depth; RLS does not protect
-- TRUNCATE, and direct client writes are not part of the supported API.
--
-- Service-role Edge Functions and the postgres owner retain their privileges.

REVOKE ALL PRIVILEGES ON TABLE
  public.zhi_forest_runtime_events,
  public.zhi_forest_runtime_state,
  public.zhi_movement_evidence,
  public.zhi_movement_requests,
  public.zhi_spatial_anchor_evidence,
  public.zhi_spatial_environment_events,
  public.zhi_strategy_records,
  public.zhi_strategy_sessions
FROM anon, authenticated;
