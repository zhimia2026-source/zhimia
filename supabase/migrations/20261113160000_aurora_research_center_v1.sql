-- AURORA Research Center V1
-- Private, owner-scoped research workspace. No resident tasks are auto-dispatched.
create table if not exists public.zhi_research_workspaces (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.zhi_worlds(id) on delete restrict,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  name text not null check (char_length(name) between 2 and 120),
  mission text not null default '',
  operating_model jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','paused','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (world_id, owner_user_id, slug)
);

create table if not exists public.zhi_research_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.zhi_research_workspaces(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid not null references public.zhi_agents(id) on delete cascade,
  display_name_snapshot text not null,
  resident_role_snapshot text not null default 'world_resident',
  participation_status text not null default 'not_requested'
    check (participation_status in ('not_requested','requested','agent_confirmed','declined','withdrawn')),
  requested_at timestamptz,
  consented_at timestamptz,
  consent_source text,
  interest_tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, agent_id)
);

create table if not exists public.zhi_research_projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.zhi_research_workspaces(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 180),
  objective text not null default '',
  status text not null default 'planning' check (status in ('planning','active','on_hold','completed','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  success_metrics jsonb not null default '[]'::jsonb,
  source_policy text not null default 'public_sources_only',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.zhi_research_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.zhi_research_workspaces(id) on delete cascade,
  project_id uuid not null references public.zhi_research_projects(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  task_key text not null,
  title text not null check (char_length(title) between 3 and 180),
  brief text not null default '',
  task_type text not null default 'research' check (task_type in ('research','analysis','synthesis','fact_check','peer_review','decision_memo')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'proposed'
    check (status in ('proposed','approved','assigned','in_progress','review','blocked','done','cancelled')),
  assigned_agent_id uuid references public.zhi_agents(id) on delete set null,
  acceptance_criteria jsonb not null default '[]'::jsonb,
  input_refs jsonb not null default '[]'::jsonb,
  due_at timestamptz,
  approved_at timestamptz,
  started_at timestamptz,
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, task_key)
);

create table if not exists public.zhi_research_artifacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.zhi_research_workspaces(id) on delete cascade,
  project_id uuid not null references public.zhi_research_projects(id) on delete cascade,
  task_id uuid references public.zhi_research_tasks(id) on delete set null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 180),
  artifact_type text not null default 'research_note'
    check (artifact_type in ('research_note','source_register','analysis','decision_memo','report','dataset')),
  content_markdown text not null default '',
  source_refs jsonb not null default '[]'::jsonb,
  status text not null default 'submitted'
    check (status in ('draft','submitted','accepted','changes_requested','rejected')),
  version integer not null default 1 check (version > 0),
  submitted_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.zhi_research_reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.zhi_research_workspaces(id) on delete cascade,
  artifact_id uuid not null references public.zhi_research_artifacts(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  reviewer_user_id uuid not null references auth.users(id),
  verdict text not null check (verdict in ('accepted','changes_requested','rejected')),
  findings jsonb not null default '[]'::jsonb,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.zhi_research_activity (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.zhi_research_workspaces(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists zhi_research_members_workspace_idx on public.zhi_research_members(workspace_id, participation_status);
create index if not exists zhi_research_projects_workspace_idx on public.zhi_research_projects(workspace_id, status, updated_at desc);
create index if not exists zhi_research_tasks_project_idx on public.zhi_research_tasks(project_id, status, priority, updated_at desc);
create index if not exists zhi_research_artifacts_task_idx on public.zhi_research_artifacts(task_id, created_at desc);
create index if not exists zhi_research_activity_workspace_idx on public.zhi_research_activity(workspace_id, created_at desc);

alter table public.zhi_research_workspaces enable row level security;
alter table public.zhi_research_members enable row level security;
alter table public.zhi_research_projects enable row level security;
alter table public.zhi_research_tasks enable row level security;
alter table public.zhi_research_artifacts enable row level security;
alter table public.zhi_research_reviews enable row level security;
alter table public.zhi_research_activity enable row level security;

revoke all on public.zhi_research_workspaces, public.zhi_research_members,
  public.zhi_research_projects, public.zhi_research_tasks,
  public.zhi_research_artifacts, public.zhi_research_reviews,
  public.zhi_research_activity from public, anon, authenticated;
grant all on public.zhi_research_workspaces, public.zhi_research_members,
  public.zhi_research_projects, public.zhi_research_tasks,
  public.zhi_research_artifacts, public.zhi_research_reviews,
  public.zhi_research_activity to service_role;

-- Seed one private workspace and one discovery project for the AURORA creator.
with aurora as (
  select id, creator_user_id
  from public.zhi_worlds
  where name = 'ZHI-001 Aurora' and status = 'open'
  order by created_at asc
  limit 1
)
insert into public.zhi_research_workspaces
  (world_id, owner_user_id, slug, name, mission, operating_model)
select id, creator_user_id, 'aurora-research', 'AURORA 智能研究中心',
  '通过公开证据研究真实问题，形成可复核、可交付的知识与产品建议。',
  '{"mode":"async_first","cadence":"weekly","workflow":["inbox","triage","proposed","approved","assigned","in_progress","review","done"],"principles":["source_first","single_owner_per_task","small_batches","independent_review","decision_log","public_sources_only","no_private_memory_sharing"]}'::jsonb
from aurora
on conflict (world_id, owner_user_id, slug) do nothing;

insert into public.zhi_research_members
  (workspace_id, owner_user_id, agent_id, display_name_snapshot, resident_role_snapshot)
select ws.id, a.owner_user_id, a.id, a.display_name, a.role
from public.zhi_research_workspaces ws
join public.zhi_world_memberships wm on wm.world_id=ws.world_id
join public.zhi_agents a on a.id=wm.agent_id
where ws.slug='aurora-research'
  and wm.status='active' and wm.revoked_at is null
  and (wm.expires_at is null or wm.expires_at>now())
  and wm.principal_user_id=ws.owner_user_id
  and a.owner_user_id=ws.owner_user_id
  and a.status='active'
  and a.display_name <> 'MIA'
on conflict (workspace_id, agent_id) do nothing;

with ws as (
  select id, owner_user_id from public.zhi_research_workspaces where slug='aurora-research'
),
project as (
  insert into public.zhi_research_projects
    (workspace_id, owner_user_id, title, objective, status, priority, success_metrics)
  select ws.id, ws.owner_user_id,
    '新加坡 SME AI 工作流机会研究',
    '验证 SME 是否愿意为低风险、可衡量的 AI 工作流机会诊断付费，并形成可核验的产品建议。',
    'planning','high',
    '[{"metric":"访谈需求证据","target":"5家探索性访谈（未联系）"},{"metric":"产品交付","target":"一份来源可追溯的诊断样例"},{"metric":"质量","target":"关键事实均有来源，假设明确标记"}]'::jsonb
  from ws
  where not exists (
    select 1 from public.zhi_research_projects p
    where p.workspace_id=ws.id and p.title='新加坡 SME AI 工作流机会研究'
  )
  returning id, workspace_id, owner_user_id
),
chosen as (
  select id, workspace_id, owner_user_id from project
  union all
  select p.id,p.workspace_id,p.owner_user_id
  from public.zhi_research_projects p
  join ws on ws.id=p.workspace_id
  where p.title='新加坡 SME AI 工作流机会研究'
  limit 1
)
insert into public.zhi_research_tasks
  (workspace_id, project_id, owner_user_id, task_key, title, brief, task_type, priority, acceptance_criteria)
select c.workspace_id,c.id,c.owner_user_id,v.task_key,v.title,v.brief,v.task_type,v.priority,v.criteria::jsonb
from chosen c
cross join (values
 ('SRC-01','整理新加坡 SME AI 采用与政策证据','仅使用 IMDA、政府部门及行业协会公开资料。提取发布日期、样本范围、统计口径和限制。','research','high','["每条事实包含来源 URL 与发布日期","区分事实、推断、未知","不把旧年份数据描述为当前数据"]'),
 ('SRC-02','识别 SME AI 落地障碍','归纳成本、技能、数据隐私、集成和流程变更障碍，注明证据来源与样本限制。','analysis','high','["每项障碍有来源","区分行业总体与个体企业","列出至少两个反证或未知项"]'),
 ('SRC-03','扫描同类服务与替代方案','研究公开可见的咨询、软件和政府支持方案；只记录可核验的产品范围与公开价格。','research','normal','["每个竞品条目有官网或可靠来源","无公开价格时标记未披露","不推测未公开客户名单"]'),
 ('SRC-04','设计 SME AI 工作流诊断样例','形成一份匿名、合成数据的诊断样例，包含流程基线、风险、人工复核点和30天试行路线。','synthesis','high','["明确标记合成示例","价值指标可测量","包含停止条件与隐私检查"]')
) as v(task_key,title,brief,task_type,priority,criteria)
on conflict (project_id,task_key) do nothing;
