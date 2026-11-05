-- Reference SQL for the ZHI Python Worker V1 schema.
-- Applied through the Supabase migration API; keep this file in sync with production.

create table if not exists public.zhi_python_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid not null references public.zhi_agents(id) on delete cascade,
  task_type text not null check (task_type in ('healthcheck', 'aurora_ecosystem_report')),
  status text not null default 'proposed'
    check (status in ('proposed', 'queued', 'running', 'completed', 'failed', 'cancelled')),
  input jsonb not null default '{}'::jsonb check (jsonb_typeof(input) = 'object'),
  permission_scope text[] not null default '{}'::text[],
  execution_limits jsonb not null default '{"timeout_seconds":10,"max_input_bytes":128000,"max_events":1000}'::jsonb
    check (jsonb_typeof(execution_limits) = 'object'),
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  error_code text check (error_code is null or char_length(error_code) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists zhi_python_jobs_owner_created_idx
  on public.zhi_python_jobs (owner_user_id, created_at desc);
create index if not exists zhi_python_jobs_agent_created_idx
  on public.zhi_python_jobs (agent_id, created_at desc);
create index if not exists zhi_python_jobs_queue_idx
  on public.zhi_python_jobs (status, created_at)
  where status in ('queued', 'running');

alter table public.zhi_python_jobs enable row level security;
revoke all on table public.zhi_python_jobs from anon, authenticated;
grant all on table public.zhi_python_jobs to service_role;

comment on table public.zhi_python_jobs is
  'Server-mediated supervised Python jobs. All reads/writes occur through zhi-python-worker after owner/token or worker-secret checks; no direct client access.';
