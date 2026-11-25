-- Keep the owner-scoped SELECT boundary unchanged while allowing Postgres
-- to evaluate auth.uid() once as an initplan instead of once per row.

DROP POLICY IF EXISTS zhi_agent_sensory_memory_events_owner_read
  ON public.zhi_agent_sensory_memory_events;

CREATE POLICY zhi_agent_sensory_memory_events_owner_read
  ON public.zhi_agent_sensory_memory_events
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = owner_user_id);
