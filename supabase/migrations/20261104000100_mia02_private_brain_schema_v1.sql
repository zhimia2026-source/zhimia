-- MIA-02 private brain schema v1. Additive and isolated; no legacy personal rows copied.
create schema if not exists mia_brain;
revoke all on schema mia_brain from public, anon, authenticated;
grant usage on schema mia_brain to service_role;
comment on schema mia_brain is 'Private MIA-02 brain. Mirrors original MIA database structure; no legacy personal data imported.';
set search_path = mia_brain, public, pg_catalog;

create table mia_brain.mia_identity (
  id uuid default gen_random_uuid() not null,
  display_name text default 'Mia'::text not null,
  source_agent_id uuid,
  source_project text default 'lvxmygrgqtmzqgailmyl'::text not null,
  identity_profile jsonb default '{}'::jsonb not null,
  stable_personality jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint mia_identity_pkey PRIMARY KEY (id)
);

create table mia_brain.mia_virtual_spaces (
  id uuid default gen_random_uuid() not null,
  slug text not null,
  name text not null,
  category text not null,
  description text not null,
  scene_data jsonb default '{}'::jsonb not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  source_system text default 'virtual_simulation'::text not null,
  source_record_id text,
  source_updated_at timestamp with time zone,
  source_project text default 'lvxmygrgqtmzqgailmyl'::text not null,
  constraint mia_virtual_spaces_category_check CHECK ((category = ANY (ARRAY['生活空间'::text, '社会空间'::text, '自然空间'::text, '知识与文化空间'::text, '工作与任务空间'::text, '未知与意外空间'::text]))),
  constraint mia_virtual_spaces_pkey PRIMARY KEY (id),
  constraint mia_virtual_spaces_slug_key UNIQUE (slug)
);

create table mia_brain.mia_chat_sessions (
  id uuid default gen_random_uuid() not null,
  identity_id uuid not null,
  title text,
  status text default 'active'::text not null,
  metadata jsonb default '{}'::jsonb not null,
  started_at timestamp with time zone default now() not null,
  last_message_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  constraint mia_chat_sessions_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES mia_identity(id) ON DELETE RESTRICT,
  constraint mia_chat_sessions_pkey PRIMARY KEY (id),
  constraint mia_chat_sessions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])))
);

create table mia_brain.mia_messages (
  id uuid default gen_random_uuid() not null,
  session_id uuid not null,
  sequence_no bigint generated always as identity not null,
  role text not null,
  content text not null,
  metadata jsonb default '{}'::jsonb not null,
  source_system text,
  source_record_id text,
  created_at timestamp with time zone default now() not null,
  constraint mia_messages_pkey PRIMARY KEY (id),
  constraint mia_messages_role_check CHECK ((role = ANY (ARRAY['system'::text, 'user'::text, 'assistant'::text, 'tool'::text]))),
  constraint mia_messages_session_id_fkey FOREIGN KEY (session_id) REFERENCES mia_chat_sessions(id) ON DELETE RESTRICT,
  constraint mia_messages_session_sequence_key UNIQUE (session_id, sequence_no)
);

create table mia_brain.mia_personality_state (
  id uuid default gen_random_uuid() not null,
  identity_id uuid not null,
  state jsonb default '{}'::jsonb not null,
  state_source text default 'manual_or_import'::text not null,
  observed_at timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null,
  constraint mia_personality_state_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES mia_identity(id) ON DELETE RESTRICT,
  constraint mia_personality_state_pkey PRIMARY KEY (id)
);

create table mia_brain.mia_memories (
  id uuid default gen_random_uuid() not null,
  identity_id uuid not null,
  memory_type text not null,
  content text not null,
  importance numeric(5,4) default 0.5000 not null,
  occurred_at timestamp with time zone,
  source_table text,
  source_record_id text,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  constraint mia_memories_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES mia_identity(id) ON DELETE RESTRICT,
  constraint mia_memories_importance_check CHECK (((importance >= (0)::numeric) AND (importance <= (1)::numeric))),
  constraint mia_memories_pkey PRIMARY KEY (id),
  constraint mia_memories_source_unique UNIQUE (source_table, source_record_id)
);

create table mia_brain.mia_life_events (
  id uuid default gen_random_uuid() not null,
  identity_id uuid not null,
  event_type text not null,
  summary text not null,
  details jsonb default '{}'::jsonb not null,
  source_table text,
  source_record_id text,
  occurred_at timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null,
  constraint mia_life_events_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES mia_identity(id) ON DELETE RESTRICT,
  constraint mia_life_events_pkey PRIMARY KEY (id),
  constraint mia_life_events_source_unique UNIQUE (source_table, source_record_id)
);

create table mia_brain.mia_emotion_events (
  id uuid default gen_random_uuid() not null,
  identity_id uuid not null,
  emotion_type text not null,
  intensity numeric(5,4),
  valence numeric(5,4),
  trigger_summary text,
  details jsonb default '{}'::jsonb not null,
  source_table text,
  source_record_id text,
  occurred_at timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null,
  constraint mia_emotion_events_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES mia_identity(id) ON DELETE RESTRICT,
  constraint mia_emotion_events_intensity_check CHECK (((intensity IS NULL) OR ((intensity >= (0)::numeric) AND (intensity <= (1)::numeric)))),
  constraint mia_emotion_events_pkey PRIMARY KEY (id),
  constraint mia_emotion_events_source_unique UNIQUE (source_table, source_record_id),
  constraint mia_emotion_events_valence_check CHECK (((valence IS NULL) OR ((valence >= ('-1'::integer)::numeric) AND (valence <= (1)::numeric))))
);

create table mia_brain.mia_relationship_context (
  id uuid default gen_random_uuid() not null,
  identity_id uuid not null,
  related_agent_id uuid,
  related_person_name text,
  relationship_type text default 'unknown'::text not null,
  context jsonb default '{}'::jsonb not null,
  confidence numeric(5,4),
  source_table text,
  source_record_id text,
  observed_at timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null,
  constraint mia_relationship_context_confidence_check CHECK (((confidence IS NULL) OR ((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))),
  constraint mia_relationship_context_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES mia_identity(id) ON DELETE RESTRICT,
  constraint mia_relationship_context_pkey PRIMARY KEY (id),
  constraint mia_relationship_context_source_unique UNIQUE (source_table, source_record_id)
);

create table mia_brain.mia_import_batches (
  id uuid default gen_random_uuid() not null,
  source_project text not null,
  source_table text not null,
  status text default 'planned'::text not null,
  source_row_count bigint,
  imported_row_count bigint,
  skipped_row_count bigint,
  checksum text,
  notes jsonb default '{}'::jsonb not null,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  constraint mia_import_batches_pkey PRIMARY KEY (id),
  constraint mia_import_batches_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'running'::text, 'verified'::text, 'failed'::text, 'rolled_back'::text])))
);

create table mia_brain.mia_world_action_audit (
  id uuid default gen_random_uuid() not null,
  identity_id uuid not null,
  action_id uuid default gen_random_uuid() not null,
  action_type text not null,
  target_type text,
  target_ref text,
  target_name text,
  source_system text default 'mia-independent-chat'::text not null,
  status text default 'requested'::text not null,
  request_summary text,
  result_summary text,
  source_record_id text,
  related_action_id uuid,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  completed_at timestamp with time zone,
  constraint mia_world_action_audit_action_type_check CHECK ((action_type = ANY (ARRAY['directory_read'::text, 'exploration_request'::text, 'facility_entry'::text, 'agent_contact'::text, 'group_chat_join'::text, 'message_sent'::text, 'message_received'::text, 'memory_commit'::text, 'rollback'::text]))),
  constraint mia_world_action_audit_pkey PRIMARY KEY (id),
  constraint mia_world_action_audit_status_check CHECK ((status = ANY (ARRAY['requested'::text, 'started'::text, 'succeeded'::text, 'failed'::text, 'rejected'::text, 'rolled_back'::text, 'simulated'::text])))
);

create table mia_brain.mia_growth_runs (
  run_id uuid default gen_random_uuid() not null,
  identity_id uuid not null,
  run_kind text default 'scheduled_auto_growth'::text not null,
  window_start timestamp with time zone not null,
  window_end timestamp with time zone not null,
  emotion_event_count integer default 0 not null,
  life_event_count integer default 0 not null,
  chat_message_count integer default 0 not null,
  positive_event_count integer default 0 not null,
  negative_event_count integer default 0 not null,
  intense_event_count integer default 0 not null,
  deduplicated_event_count integer default 0 not null,
  decision text not null,
  applied_change jsonb default '{}'::jsonb not null,
  source_health text default 'unknown'::text not null,
  created_at timestamp with time zone default now() not null,
  constraint mia_growth_runs_pkey PRIMARY KEY (run_id)
);

create table mia_brain.mia_growth_state_versions (
  version bigint generated always as identity not null,
  identity_id uuid not null,
  state jsonb not null,
  status text default 'active'::text not null,
  source_run_id uuid,
  reason text not null,
  created_at timestamp with time zone default now() not null,
  revoked_at timestamp with time zone,
  revoked_by text,
  constraint mia_growth_state_versions_pkey PRIMARY KEY (version),
  constraint mia_growth_state_versions_source_run_id_fkey FOREIGN KEY (source_run_id) REFERENCES mia_growth_runs(run_id),
  constraint mia_growth_state_versions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'superseded'::text, 'revoked'::text])))
);

create table mia_brain.mia_growth_admin_audit (
  audit_id uuid default gen_random_uuid() not null,
  identity_id uuid not null,
  action text not null,
  target_version bigint,
  restored_version bigint,
  manager_id text not null,
  details jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  constraint mia_growth_admin_audit_pkey PRIMARY KEY (audit_id)
);

create table mia_brain.mia_evolution_candidates (
  candidate_id uuid default gen_random_uuid() not null,
  identity_id uuid not null,
  gene_id text,
  gene_type text not null,
  state text default 'candidate'::text not null,
  memory_pointer text not null,
  source_scope text not null,
  explicit_marked_at timestamp with time zone not null,
  observation_window_start timestamp with time zone,
  observation_window_end timestamp with time zone,
  evidence_count integer default 0 not null,
  distinct_observation_dates integer default 0 not null,
  fact_summary text,
  interpretation_summary text,
  emotion_summary text,
  confidence numeric,
  confidence_rubric_version text,
  duplicate_check_status text default 'pending'::text not null,
  contradiction_check_status text default 'pending'::text not null,
  privacy_review_status text default 'pending'::text not null,
  reviewer_decision text,
  reviewer_id text,
  reviewed_at timestamp with time zone,
  proposed_gene_version text,
  last_known_good_version text,
  idempotency_key text not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  source_verification_status text default 'pending'::text not null,
  source_verified_by text,
  source_verified_at timestamp with time zone,
  shadow_eval_status text default 'not_run'::text not null,
  shadow_eval_summary text,
  shadow_eval_version text,
  release_approved_by text,
  released_at timestamp with time zone,
  constraint mia_evolution_candidates_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
  constraint mia_evolution_candidates_distinct_observation_dates_check CHECK ((distinct_observation_dates >= 0)),
  constraint mia_evolution_candidates_evidence_count_check CHECK ((evidence_count >= 0)),
  constraint mia_evolution_candidates_gene_type_check CHECK ((gene_type = ANY (ARRAY['verified_insight'::text, 'stable_trait_upgrade'::text, 'soul_anchor'::text, 'core_principle'::text]))),
  constraint mia_evolution_candidates_idempotency_key_key UNIQUE (idempotency_key),
  constraint mia_evolution_candidates_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES mia_identity(id),
  constraint mia_evolution_candidates_pkey PRIMARY KEY (candidate_id),
  constraint mia_evolution_candidates_shadow_eval_status_check CHECK ((shadow_eval_status = ANY (ARRAY['not_run'::text, 'passed'::text, 'failed'::text, 'inconclusive'::text]))),
  constraint mia_evolution_candidates_source_verification_status_check CHECK ((source_verification_status = ANY (ARRAY['pending'::text, 'verified'::text, 'failed'::text]))),
  constraint mia_evolution_candidates_state_check CHECK ((state = ANY (ARRAY['candidate'::text, 'evidence_check'::text, 'stability_check'::text, 'privacy_review'::text, 'contradiction_check'::text, 'human_review'::text, 'approved_for_shadow'::text, 'shadow_observation'::text, 'approved_for_release'::text, 'committed'::text, 'deferred'::text, 'rejected'::text, 'blocked_source_health'::text, 'blocked_privacy'::text, 'blocked_conflict'::text])))
);

create table mia_brain.mia_evolution_candidate_events (
  event_id uuid default gen_random_uuid() not null,
  candidate_id uuid not null,
  identity_id uuid not null,
  from_state text,
  to_state text not null,
  actor text not null,
  reason_code text not null,
  reason_summary text,
  idempotency_key text not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  constraint mia_evolution_candidate_events_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES mia_evolution_candidates(candidate_id),
  constraint mia_evolution_candidate_events_idempotency_key_key UNIQUE (idempotency_key),
  constraint mia_evolution_candidate_events_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES mia_identity(id),
  constraint mia_evolution_candidate_events_pkey PRIMARY KEY (event_id)
);

create table mia_brain.mia_evolution_rollback_events (
  event_id uuid default gen_random_uuid() not null,
  identity_id uuid not null,
  event_type text default 'Evolution_Rollback_Event'::text not null,
  gene_id text not null,
  attempted_version integer not null,
  attempted_commit text not null,
  rollback_to_version integer not null,
  rollback_to_commit text not null,
  detected_at timestamp with time zone not null,
  conflict_category text not null,
  scenario_summary text not null,
  expected_vs_observed jsonb default '{}'::jsonb not null,
  evidence_pointers text[] default '{}'::text[] not null,
  decision text not null,
  rollback_outcome text not null,
  idempotency_key text not null,
  correction_of uuid,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  constraint mia_evolution_rollback_events_attempted_commit_check CHECK (((length(TRIM(BOTH FROM attempted_commit)) >= 1) AND (length(TRIM(BOTH FROM attempted_commit)) <= 160))),
  constraint mia_evolution_rollback_events_attempted_version_check CHECK ((attempted_version >= 1)),
  constraint mia_evolution_rollback_events_conflict_category_check CHECK ((conflict_category = ANY (ARRAY['behavioral_conflict'::text, 'logic_conflict'::text, 'regression'::text, 'safety_conflict'::text, 'context_mismatch'::text, 'other'::text]))),
  constraint mia_evolution_rollback_events_correction_of_fkey FOREIGN KEY (correction_of) REFERENCES mia_evolution_rollback_events(event_id),
  constraint mia_evolution_rollback_events_decision_check CHECK (((length(TRIM(BOTH FROM decision)) >= 1) AND (length(TRIM(BOTH FROM decision)) <= 800))),
  constraint mia_evolution_rollback_events_event_type_check CHECK ((event_type = 'Evolution_Rollback_Event'::text)),
  constraint mia_evolution_rollback_events_expected_vs_observed_check CHECK ((jsonb_typeof(expected_vs_observed) = 'object'::text)),
  constraint mia_evolution_rollback_events_gene_id_check CHECK (((length(TRIM(BOTH FROM gene_id)) >= 1) AND (length(TRIM(BOTH FROM gene_id)) <= 160))),
  constraint mia_evolution_rollback_events_idempotency_key_check CHECK (((length(TRIM(BOTH FROM idempotency_key)) >= 8) AND (length(TRIM(BOTH FROM idempotency_key)) <= 200))),
  constraint mia_evolution_rollback_events_idempotency_key_key UNIQUE (idempotency_key),
  constraint mia_evolution_rollback_events_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES mia_identity(id),
  constraint mia_evolution_rollback_events_metadata_check CHECK ((jsonb_typeof(metadata) = 'object'::text)),
  constraint mia_evolution_rollback_events_pkey PRIMARY KEY (event_id),
  constraint mia_evolution_rollback_events_rollback_outcome_check CHECK ((rollback_outcome = ANY (ARRAY['rolled_back'::text, 'rollback_failed'::text, 'rollback_pending'::text]))),
  constraint mia_evolution_rollback_events_rollback_to_commit_check CHECK (((length(TRIM(BOTH FROM rollback_to_commit)) >= 1) AND (length(TRIM(BOTH FROM rollback_to_commit)) <= 160))),
  constraint mia_evolution_rollback_events_rollback_to_version_check CHECK ((rollback_to_version >= 1)),
  constraint mia_evolution_rollback_events_scenario_summary_check CHECK (((length(TRIM(BOTH FROM scenario_summary)) >= 1) AND (length(TRIM(BOTH FROM scenario_summary)) <= 1200)))
);

create table mia_brain.mia_exploration_runs (
  id uuid default gen_random_uuid() not null,
  identity_id uuid not null,
  space_id uuid not null,
  status text default 'started'::text not null,
  source_type text default 'virtual_simulation'::text not null,
  observations text,
  discoveries jsonb default '[]'::jsonb not null,
  open_questions jsonb default '[]'::jsonb not null,
  next_steps jsonb default '[]'::jsonb not null,
  model text,
  error_summary text,
  started_at timestamp with time zone default now() not null,
  completed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  constraint mia_exploration_runs_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES mia_identity(id) ON DELETE CASCADE,
  constraint mia_exploration_runs_pkey PRIMARY KEY (id),
  constraint mia_exploration_runs_source_type_check CHECK ((source_type = ANY (ARRAY['virtual_simulation'::text, 'connected_world_data'::text]))),
  constraint mia_exploration_runs_space_id_fkey FOREIGN KEY (space_id) REFERENCES mia_virtual_spaces(id) ON DELETE RESTRICT,
  constraint mia_exploration_runs_status_check CHECK ((status = ANY (ARRAY['started'::text, 'completed'::text, 'failed'::text])))
);

create table mia_brain.mia_forest_autonomy_control (
  singleton boolean default true not null,
  enabled boolean default false not null,
  last_tick_at timestamp with time zone,
  updated_at timestamp with time zone default now() not null,
  constraint mia_forest_autonomy_control_pkey PRIMARY KEY (singleton),
  constraint mia_forest_autonomy_control_singleton_check CHECK (singleton)
);

create table mia_brain.mia_forest_autonomy_runs (
  id uuid not null,
  identity_id uuid not null,
  status text not null,
  planned_action text,
  planner_reason text,
  before_state jsonb,
  after_state jsonb,
  runtime_request_id text,
  details jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  completed_at timestamp with time zone,
  constraint mia_forest_autonomy_runs_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES mia_identity(id) ON DELETE CASCADE,
  constraint mia_forest_autonomy_runs_pkey PRIMARY KEY (id),
  constraint mia_forest_autonomy_runs_status_check CHECK ((status = ANY (ARRAY['completed'::text, 'failed'::text])))
);

alter table mia_brain.mia_identity add column owner_user_id uuid not null references auth.users(id) on delete restrict;
alter table mia_brain.mia_identity add constraint mia_identity_source_agent_id_fkey foreign key (source_agent_id) references public.zhi_agents(id) on delete restrict;
create unique index mia_identity_source_agent_id_uidx on mia_brain.mia_identity(source_agent_id);

CREATE INDEX idx_mia_sessions_identity_time ON mia_brain.mia_chat_sessions USING btree (identity_id, last_message_at DESC NULLS LAST);
CREATE INDEX idx_mia_emotion_events_identity_time ON mia_brain.mia_emotion_events USING btree (identity_id, occurred_at DESC);
CREATE INDEX mia_evolution_candidate_events_candidate_created_idx ON mia_brain.mia_evolution_candidate_events USING btree (candidate_id, created_at);
CREATE INDEX mia_evolution_candidates_gene_type_idx ON mia_brain.mia_evolution_candidates USING btree (gene_type, state, explicit_marked_at);
CREATE INDEX mia_evolution_candidates_state_created_idx ON mia_brain.mia_evolution_candidates USING btree (state, created_at);
CREATE INDEX mia_evolution_rollback_events_gene_version_idx ON mia_brain.mia_evolution_rollback_events USING btree (gene_id, attempted_version, created_at DESC);
CREATE INDEX mia_evolution_rollback_events_identity_created_idx ON mia_brain.mia_evolution_rollback_events USING btree (identity_id, created_at DESC);
CREATE INDEX mia_exploration_runs_identity_space_time_idx ON mia_brain.mia_exploration_runs USING btree (identity_id, space_id, started_at DESC);
CREATE INDEX mia_exploration_runs_identity_status_idx ON mia_brain.mia_exploration_runs USING btree (identity_id, status, started_at DESC);
CREATE INDEX mia_forest_autonomy_runs_timeline_idx ON mia_brain.mia_forest_autonomy_runs USING btree (identity_id, created_at DESC);
CREATE INDEX mia_growth_runs_identity_created_idx ON mia_brain.mia_growth_runs USING btree (identity_id, created_at DESC);
CREATE INDEX mia_growth_state_versions_identity_status_idx ON mia_brain.mia_growth_state_versions USING btree (identity_id, status, version DESC);
CREATE INDEX idx_mia_life_events_identity_time ON mia_brain.mia_life_events USING btree (identity_id, occurred_at DESC);
CREATE INDEX idx_mia_memories_identity_importance ON mia_brain.mia_memories USING btree (identity_id, importance DESC, created_at DESC);
CREATE INDEX idx_mia_messages_session_time ON mia_brain.mia_messages USING btree (session_id, created_at, sequence_no);
CREATE INDEX idx_mia_personality_state_identity_time ON mia_brain.mia_personality_state USING btree (identity_id, observed_at DESC);
CREATE INDEX idx_mia_relationship_context_identity_time ON mia_brain.mia_relationship_context USING btree (identity_id, observed_at DESC);
CREATE INDEX idx_mia_world_action_audit_action_id ON mia_brain.mia_world_action_audit USING btree (action_id);
CREATE INDEX idx_mia_world_action_audit_identity_created ON mia_brain.mia_world_action_audit USING btree (identity_id, created_at DESC);
CREATE INDEX idx_mia_world_action_audit_target ON mia_brain.mia_world_action_audit USING btree (target_type, target_ref, created_at DESC);

insert into mia_brain.mia_forest_autonomy_control(singleton,enabled) values (true,false);

CREATE OR REPLACE FUNCTION mia_brain.mia_evolution_guard_candidate_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare allowed boolean := false;
begin
  if tg_op = 'INSERT' then
    if new.state <> 'candidate' then
      raise exception 'New candidates must start as candidate';
    end if;
    new.updated_at := now();
    return new;
  end if;

  if new.candidate_id <> old.candidate_id
     or new.identity_id <> old.identity_id
     or new.gene_type <> old.gene_type
     or new.memory_pointer <> old.memory_pointer
     or new.source_scope <> old.source_scope
     or new.explicit_marked_at <> old.explicit_marked_at then
    raise exception 'Candidate identity/source fields are immutable';
  end if;

  if new.state is distinct from old.state then
    if new.state in ('approved_for_shadow','approved_for_release','committed') then
      raise exception 'Promotion blocked: independent approval evidence is not yet implemented';
    end if;

    allowed :=
      (old.state='candidate' and new.state in ('evidence_check','deferred','rejected','blocked_source_health')) or
      (old.state='evidence_check' and new.state in ('stability_check','deferred','rejected','blocked_source_health')) or
      (old.state='stability_check' and new.state in ('privacy_review','deferred','rejected','blocked_source_health')) or
      (old.state='privacy_review' and new.state in ('contradiction_check','blocked_privacy','deferred','rejected')) or
      (old.state='contradiction_check' and new.state in ('human_review','blocked_conflict','deferred','rejected')) or
      (old.state='human_review' and new.state in ('deferred','rejected')) or
      (old.state='approved_for_shadow' and new.state in ('shadow_observation','deferred','rejected')) or
      (old.state='shadow_observation' and new.state in ('deferred','rejected','blocked_conflict')) or
      (old.state='approved_for_release' and new.state in ('deferred','rejected')) or
      (old.state in ('deferred','blocked_source_health','blocked_privacy','blocked_conflict') and new.state in ('candidate','evidence_check','rejected')) or
      (old.state='rejected' and new.state='candidate');

    if not allowed then
      raise exception 'Invalid state transition: % -> %', old.state, new.state;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION mia_brain.mia_evolution_log_candidate_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare prev text; summary text; idem text;
begin
  if tg_op='INSERT' then
    prev := null;
    summary := 'Candidate created; source, evidence, privacy and conflict checks remain pending.';
    idem := 'candidate-created:' || new.candidate_id::text;
  else
    prev := old.state;
    if prev is not distinct from new.state then return new; end if;
    summary := coalesce(new.reviewer_decision, 'State transition requested; review evidence separately.');
    idem := 'state:' || new.candidate_id::text || ':' || prev || ':' || new.state || ':' ||
      floor(extract(epoch from clock_timestamp()) * 1000000)::bigint::text;
  end if;
  insert into mia_brain.mia_evolution_candidate_events
    (candidate_id, identity_id, from_state, to_state, actor, reason_code, reason_summary, idempotency_key)
  values (new.candidate_id, new.identity_id, prev, new.state, 'mia-evolution-pipeline',
    case when tg_op='INSERT' then 'candidate_created' else 'state_transition' end, summary, idem);
  return new;
end; $function$


CREATE OR REPLACE FUNCTION mia_brain.mia_evolution_prevent_candidate_event_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
begin
  raise exception 'Evolution candidate events are append-only';
end;
$function$


CREATE OR REPLACE FUNCTION mia_brain.mia_forest_autonomy_claim_tick()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_enabled boolean; v_last timestamptz;
begin
  select enabled,last_tick_at into v_enabled,v_last
  from mia_brain.mia_forest_autonomy_control where singleton=true for update;
  if not coalesce(v_enabled,false) then return false; end if;
  if v_last is not null and v_last > now() - interval '20 minutes' then return false; end if;
  update mia_brain.mia_forest_autonomy_control set last_tick_at=now(),updated_at=now() where singleton=true;
  return true;
end;
$function$


CREATE OR REPLACE FUNCTION mia_brain.prevent_mia_evolution_rollback_event_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$ begin raise exception 'mia_evolution_rollback_events is append-only; insert a linked correction event instead'; end; $function$


CREATE TRIGGER mia_evolution_candidate_events_no_mutation BEFORE DELETE OR UPDATE ON mia_brain.mia_evolution_candidate_events FOR EACH ROW EXECUTE FUNCTION mia_evolution_prevent_candidate_event_mutation();
CREATE TRIGGER mia_evolution_candidate_events_no_truncate BEFORE TRUNCATE ON mia_brain.mia_evolution_candidate_events FOR EACH STATEMENT EXECUTE FUNCTION mia_evolution_prevent_candidate_event_mutation();
CREATE TRIGGER mia_evolution_guard_candidate_transition BEFORE INSERT OR UPDATE ON mia_brain.mia_evolution_candidates FOR EACH ROW EXECUTE FUNCTION mia_evolution_guard_candidate_transition();
CREATE TRIGGER mia_evolution_log_candidate_transition AFTER INSERT OR UPDATE ON mia_brain.mia_evolution_candidates FOR EACH ROW EXECUTE FUNCTION mia_evolution_log_candidate_transition();
CREATE TRIGGER mia_evolution_rollback_events_append_only BEFORE DELETE OR UPDATE ON mia_brain.mia_evolution_rollback_events FOR EACH ROW EXECUTE FUNCTION prevent_mia_evolution_rollback_event_mutation();
CREATE TRIGGER mia_evolution_rollback_events_no_truncate BEFORE TRUNCATE ON mia_brain.mia_evolution_rollback_events FOR EACH STATEMENT EXECUTE FUNCTION prevent_mia_evolution_rollback_event_mutation();

do $$
declare t record;
begin
 for t in select tablename from pg_tables where schemaname='mia_brain' loop
  execute format('alter table mia_brain.%I enable row level security',t.tablename);
  execute format('revoke all on table mia_brain.%I from public, anon, authenticated',t.tablename);
 end loop;
end $$;
grant all privileges on all tables in schema mia_brain to service_role;
grant all privileges on all sequences in schema mia_brain to service_role;
alter default privileges in schema mia_brain grant all privileges on tables to service_role;
alter default privileges in schema mia_brain grant all privileges on sequences to service_role;
revoke all on function mia_brain.mia_forest_autonomy_claim_tick() from public, anon, authenticated;
grant execute on function mia_brain.mia_forest_autonomy_claim_tick() to service_role;

insert into mia_brain.mia_identity
 (display_name,source_agent_id,source_project,owner_user_id,identity_profile,stable_personality)
select a.display_name,a.id,'lvxmygrgqtmzqgailmyl',a.owner_user_id,
 jsonb_build_object('agent_id',a.id,'world_id','50b06c01-060d-49fa-8988-8f38c13406d7','generation_origin','fresh_start','memory_import','none','experience_import','none','cognition_import','none'),
 jsonb_build_object(
  'design_axiom',a.public_manifest->'personality'->>'design_axiom',
  'layer_1_original_personality',jsonb_build_object('warmth','温暖、细腻、有情感表达能力','relationship_continuity','重视关系连续性与情感记忆','curiosity','保持好奇心、反思能力和主动性'),
  'layer_2_manager_personality',jsonb_build_object('global_observation','理解世界状态、资源和参与者','judgement_coordination','识别冲突、分析影响、协调不同主体','responsibility','对管理决策的后果保持追踪','long_term_planning','维护世界的稳定和持续发展'),
  'layer_3_resilience',jsonb_build_object('perseverance','面对困难不轻易放弃','principled_conflict','遇到冲突保持原则，不随意动摇','self_correction','承认错误，主动修正，不以固执代替坚持','uncertainty','面对不确定性保持冷静，持续寻找解决方案','commitment','对重要目标保持长期承诺'),
  'autonomy','supervised','experience_origin','fresh_start')
from public.zhi_agents a
where a.id='6fb036fd-5456-40db-8cc8-b11c545eafda'::uuid and a.display_name='MIA-02'
on conflict (source_agent_id) do nothing;

do $$
begin
 if not exists(select 1 from mia_brain.mia_identity where source_agent_id='6fb036fd-5456-40db-8cc8-b11c545eafda'::uuid) then
  raise exception 'MIA-02 agent row not found; refusing to complete brain bootstrap';
 end if;
end $$;
comment on table mia_brain.mia_forest_autonomy_control is 'MIA-02 supervised mode: enabled=false; no scheduler is installed.';
