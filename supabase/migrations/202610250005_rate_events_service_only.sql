-- Make the service-only intent explicit to the security advisor; end-user roles remain denied.
create policy "zhi_health_rate_events_service_only"
  on public.zhi_health_rate_events
  for all to service_role
  using (true)
  with check (true);
