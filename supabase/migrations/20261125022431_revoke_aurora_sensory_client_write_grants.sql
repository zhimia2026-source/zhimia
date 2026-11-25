-- Sensory memories and couplings are private resident-owned data.
-- Keep authenticated owner-scoped SELECT policies, but do not permit direct
-- client writes or TRUNCATE. RLS does not protect TRUNCATE.
-- The service_role backend retains its existing privileges.

REVOKE ALL PRIVILEGES ON TABLE
  public.zhi_agent_sensory_memory_events
FROM anon;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.zhi_agent_sensory_memory_events
FROM authenticated;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.zhi_agent_sensory_couplings,
  public.zhi_agent_sensory_memory_summaries
FROM authenticated;
