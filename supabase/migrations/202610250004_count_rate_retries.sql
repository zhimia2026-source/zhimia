-- Count every authenticated call, including retries, so reusing request_id cannot bypass the pilot limiter.
alter table public.zhi_health_rate_events
  drop constraint if exists zhi_health_rate_events_user_id_request_id_key;
