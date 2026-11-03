-- ZHI_Biogenesis_Engine V0.1
-- Append-only, provenance-first exchange ledger. No payment rails or physical controls.

create table if not exists public.zhi_biogenesis_contributions (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.zhi_worlds(id) on delete restrict,
  direction text not null check (direction in ('silicon_to_carbon','carbon_to_silicon')),
  contribution_kind text not null check (contribution_kind in (
    'research_proposal','engineering_blueprint','philosophy','artwork',
    'physical_measurement','experiment_result','compute_support','energy_support',
    'human_feedback','other'
  )),
  submitted_by_user_id uuid not null references auth.users(id) on delete restrict,
  submitted_by_agent_id uuid references public.zhi_agents(id) on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 180),
  abstract text not null check (length(btrim(abstract)) between 1 and 5000),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance) = 'object'),
  data_classification text not null default 'world_shared'
    check (data_classification in ('public','world_shared')),
  verification_requirement text not null default 'human_review'
    check (verification_requirement in ('human_review','reproducibility_check','physical_test','peer_review')),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  constraint zhi_biogenesis_direction_actor_check check (
    (direction = 'silicon_to_carbon' and submitted_by_agent_id is not null)
    or
    (direction = 'carbon_to_silicon' and submitted_by_agent_id is null)
  ),
  constraint zhi_biogenesis_idempotency_unique
    unique (world_id, submitted_by_user_id, idempotency_key)
);

create table if not exists public.zhi_biogenesis_reviews (
  id uuid primary key default gen_random_uuid(),
  contribution_id uuid not null references public.zhi_biogenesis_contributions(id) on delete restrict,
  reviewer_user_id uuid not null references auth.users(id) on delete restrict,
  outcome text not null check (outcome in (
    'triaged','request_evidence','validated','rejected','withdrawn'
  )),
  verification_method text not null check (verification_method in (
    'editorial_review','provenance_check','reproducibility_check',
    'external_lab','human_feedback_review'
  )),
  note text not null check (length(btrim(note)) between 1 and 4000),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists zhi_biogenesis_contributions_world_created_idx
  on public.zhi_biogenesis_contributions(world_id, created_at desc);
create index if not exists zhi_biogenesis_contributions_agent_idx
  on public.zhi_biogenesis_contributions(submitted_by_agent_id, created_at desc)
  where submitted_by_agent_id is not null;
create index if not exists zhi_biogenesis_reviews_contribution_created_idx
  on public.zhi_biogenesis_reviews(contribution_id, created_at desc);

alter table public.zhi_biogenesis_contributions enable row level security;
alter table public.zhi_biogenesis_reviews enable row level security;

revoke all on table public.zhi_biogenesis_contributions from public, anon, authenticated;
revoke all on table public.zhi_biogenesis_reviews from public, anon, authenticated;
grant select, insert on table public.zhi_biogenesis_contributions to service_role;
grant select, insert on table public.zhi_biogenesis_reviews to service_role;

create or replace function public.zhi_reject_biogenesis_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  raise exception 'zhi_biogenesis_records_are_append_only' using errcode = '42501';
end;
$function$;

drop trigger if exists zhi_biogenesis_contributions_append_only on public.zhi_biogenesis_contributions;
create trigger zhi_biogenesis_contributions_append_only
before update or delete on public.zhi_biogenesis_contributions
for each row execute function public.zhi_reject_biogenesis_mutation();

drop trigger if exists zhi_biogenesis_reviews_append_only on public.zhi_biogenesis_reviews;
create trigger zhi_biogenesis_reviews_append_only
before update or delete on public.zhi_biogenesis_reviews
for each row execute function public.zhi_reject_biogenesis_mutation();

comment on table public.zhi_biogenesis_contributions is
  'Append-only, provenance-first records exchanged between ZHI silicon civilization and the carbon-based physical world. Private cognition and raw credentials are forbidden payloads.';
comment on table public.zhi_biogenesis_reviews is
  'Append-only human review and verification ledger for Biogenesis contributions. A validated record means only the stated verification method passed, not universal truth.';
