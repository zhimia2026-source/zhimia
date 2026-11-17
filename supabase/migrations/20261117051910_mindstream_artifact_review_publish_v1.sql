
-- MINDSTREAM resident-authored research artifacts, immutable versions, independent peer review and publication.
ALTER TABLE public.zhi_research_reviews
  ADD COLUMN IF NOT EXISTS reviewer_agent_id uuid REFERENCES public.zhi_agents(id),
  ADD COLUMN IF NOT EXISTS review_version integer NOT NULL DEFAULT 1 CHECK (review_version > 0);

CREATE UNIQUE INDEX IF NOT EXISTS zhi_research_reviews_agent_version_unique
  ON public.zhi_research_reviews (artifact_id, review_version, reviewer_agent_id)
  WHERE reviewer_agent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.zhi_research_artifact_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.zhi_research_workspaces(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES public.zhi_research_artifacts(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 180),
  artifact_type text NOT NULL CHECK (artifact_type IN ('research_note','source_register','analysis','decision_memo','report','dataset')),
  content_markdown text NOT NULL CHECK (char_length(content_markdown) BETWEEN 100 AND 30000),
  source_refs jsonb NOT NULL CHECK (jsonb_typeof(source_refs) = 'array' AND jsonb_array_length(source_refs) BETWEEN 1 AND 40),
  submitted_by_agent_id uuid NOT NULL REFERENCES public.zhi_agents(id),
  source_chat_turn_id uuid NOT NULL REFERENCES public.zhi_agent_chat_turns(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (artifact_id, version),
  UNIQUE (source_chat_turn_id)
);

CREATE INDEX IF NOT EXISTS zhi_research_artifact_versions_workspace_created_idx
  ON public.zhi_research_artifact_versions (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.zhi_mindstream_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.zhi_research_workspaces(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES public.zhi_research_artifacts(id) ON DELETE CASCADE,
  artifact_version integer NOT NULL,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,100}$'),
  author_agent_id uuid NOT NULL REFERENCES public.zhi_agents(id),
  reviewer_agent_ids uuid[] NOT NULL CHECK (
    cardinality(reviewer_agent_ids) = 2 AND reviewer_agent_ids[1] <> reviewer_agent_ids[2]
  ),
  published_by_agent_id uuid NOT NULL REFERENCES public.zhi_agents(id),
  published_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (artifact_id, artifact_version),
  FOREIGN KEY (artifact_id, artifact_version)
    REFERENCES public.zhi_research_artifact_versions (artifact_id, version) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS zhi_mindstream_publications_published_idx
  ON public.zhi_mindstream_publications (published_at DESC) WHERE withdrawn_at IS NULL;

ALTER TABLE public.zhi_research_artifact_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zhi_mindstream_publications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zhi_research_artifact_versions FROM anon, authenticated;
REVOKE ALL ON public.zhi_mindstream_publications FROM anon, authenticated;
GRANT ALL ON public.zhi_research_artifact_versions TO service_role;
GRANT ALL ON public.zhi_mindstream_publications TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.zhi_research_reviews TO service_role;

CREATE OR REPLACE FUNCTION public.zhi_submit_resident_research_artifact_v1(
  p_workspace_id uuid,
  p_owner_user_id uuid,
  p_agent_id uuid,
  p_task_id uuid,
  p_source_chat_turn_id uuid,
  p_title text,
  p_artifact_type text,
  p_content_markdown text,
  p_source_refs jsonb,
  p_existing_artifact_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_task public.zhi_research_tasks%ROWTYPE;
  v_artifact public.zhi_research_artifacts%ROWTYPE;
  v_version integer;
  v_now timestamptz := now();
BEGIN
  IF p_title IS NULL OR char_length(btrim(p_title)) NOT BETWEEN 3 AND 180
     OR p_artifact_type NOT IN ('research_note','source_register','analysis','decision_memo','report','dataset')
     OR p_content_markdown IS NULL OR char_length(btrim(p_content_markdown)) NOT BETWEEN 100 AND 30000
     OR p_source_refs IS NULL OR jsonb_typeof(p_source_refs) <> 'array'
     OR jsonb_array_length(p_source_refs) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'invalid_artifact_payload' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_source_refs) AS src(value)
    WHERE jsonb_typeof(src.value) <> 'object'
       OR coalesce(src.value->>'url','') !~* '^https?://[^[:space:]]+$'
       OR char_length(btrim(coalesce(src.value->>'title',''))) < 3
       OR char_length(btrim(coalesce(src.value->>'claim',''))) < 8
  ) THEN
    RAISE EXCEPTION 'source_reference_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_task
  FROM public.zhi_research_tasks
  WHERE id = p_task_id AND workspace_id = p_workspace_id AND owner_user_id = p_owner_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'research_task_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_task.assigned_agent_id IS DISTINCT FROM p_agent_id
     OR v_task.claimed_by_agent_id IS DISTINCT FROM p_agent_id
     OR v_task.status NOT IN ('claimed','in_progress','changes_requested') THEN
    RAISE EXCEPTION 'resident_does_not_own_active_task' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.zhi_agents a
    WHERE a.id = p_agent_id AND a.owner_user_id = p_owner_user_id AND a.status = 'active'
  ) THEN RAISE EXCEPTION 'active_owned_resident_required' USING ERRCODE = '42501'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.zhi_research_members m
    WHERE m.workspace_id = p_workspace_id AND m.owner_user_id = p_owner_user_id
      AND m.agent_id = p_agent_id AND m.participation_status NOT IN ('declined','withdrawn')
  ) THEN RAISE EXCEPTION 'resident_not_in_research_workspace' USING ERRCODE = '42501'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.zhi_agent_chat_turns t
    WHERE t.id = p_source_chat_turn_id AND t.owner_user_id = p_owner_user_id
      AND t.agent_id = p_agent_id AND t.status = 'complete'
  ) THEN RAISE EXCEPTION 'source_chat_turn_not_owned_or_complete' USING ERRCODE = '42501'; END IF;

  IF p_existing_artifact_id IS NULL THEN
    INSERT INTO public.zhi_research_artifacts (
      workspace_id, project_id, task_id, owner_user_id, title, artifact_type,
      content_markdown, source_refs, status, version, submitted_by_user_id,
      submitted_by_agent_id, source_chat_turn_id, created_at, updated_at
    ) VALUES (
      p_workspace_id, v_task.project_id, p_task_id, p_owner_user_id, btrim(p_title), p_artifact_type,
      p_content_markdown, p_source_refs, 'submitted', 1, p_owner_user_id,
      p_agent_id, p_source_chat_turn_id, v_now, v_now
    ) RETURNING * INTO v_artifact;
    v_version := 1;
  ELSE
    SELECT * INTO v_artifact FROM public.zhi_research_artifacts
    WHERE id = p_existing_artifact_id AND workspace_id = p_workspace_id
      AND owner_user_id = p_owner_user_id AND task_id = p_task_id
      AND submitted_by_agent_id = p_agent_id
    FOR UPDATE;
    IF NOT FOUND OR v_artifact.status <> 'changes_requested' THEN
      RAISE EXCEPTION 'artifact_revision_not_allowed' USING ERRCODE = '42501';
    END IF;
    v_version := v_artifact.version + 1;
    UPDATE public.zhi_research_artifacts
    SET title = btrim(p_title), artifact_type = p_artifact_type, content_markdown = p_content_markdown,
        source_refs = p_source_refs, status = 'submitted', version = v_version,
        source_chat_turn_id = p_source_chat_turn_id, updated_at = v_now
    WHERE id = p_existing_artifact_id
    RETURNING * INTO v_artifact;
  END IF;

  INSERT INTO public.zhi_research_artifact_versions (
    workspace_id, artifact_id, owner_user_id, version, title, artifact_type,
    content_markdown, source_refs, submitted_by_agent_id, source_chat_turn_id
  ) VALUES (
    p_workspace_id, v_artifact.id, p_owner_user_id, v_version, btrim(p_title), p_artifact_type,
    p_content_markdown, p_source_refs, p_agent_id, p_source_chat_turn_id
  );

  IF v_task.status IN ('claimed','changes_requested') THEN
    UPDATE public.zhi_research_tasks
    SET status = 'in_progress', started_at = coalesce(started_at, v_now), updated_at = v_now
    WHERE id = p_task_id;
  END IF;
  UPDATE public.zhi_research_tasks
  SET status = 'review', submitted_at = v_now, updated_at = v_now
  WHERE id = p_task_id AND status = 'in_progress';

  INSERT INTO public.zhi_research_activity (
    workspace_id, owner_user_id, actor_type, actor_agent_id, event_type,
    entity_type, entity_id, summary, metadata
  ) VALUES (
    p_workspace_id, p_owner_user_id, 'agent', p_agent_id, 'artifact.submitted',
    'artifact', v_artifact.id, 'AURORA 居民提交研究成果',
    jsonb_build_object('task_key', v_task.task_key, 'version', v_version,
      'source_chat_turn_id', p_source_chat_turn_id, 'source_count', jsonb_array_length(p_source_refs),
      'provenance', 'runtime_observed_model_output', 'attestation_verified', false)
  );

  RETURN jsonb_build_object('artifact_id', v_artifact.id, 'version', v_version,
    'status', 'submitted', 'task_id', p_task_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.zhi_record_resident_research_review_v1(
  p_workspace_id uuid,
  p_owner_user_id uuid,
  p_reviewer_agent_id uuid,
  p_artifact_id uuid,
  p_review_version integer,
  p_verdict text,
  p_findings jsonb,
  p_notes text,
  p_source_chat_turn_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_artifact public.zhi_research_artifacts%ROWTYPE;
  v_task public.zhi_research_tasks%ROWTYPE;
  v_author uuid;
  v_review_count integer;
  v_accepted_count integer;
  v_reviewers uuid[];
  v_publication_slug text;
  v_publication_id uuid;
  v_now timestamptz := now();
BEGIN
  IF p_verdict NOT IN ('accepted','changes_requested','rejected')
     OR p_review_version IS NULL OR p_review_version < 1
     OR p_findings IS NULL OR jsonb_typeof(p_findings) <> 'array'
     OR jsonb_array_length(p_findings) > 30
     OR char_length(coalesce(p_notes,'')) > 4000 THEN
    RAISE EXCEPTION 'invalid_review_payload' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_artifact FROM public.zhi_research_artifacts
  WHERE id = p_artifact_id AND workspace_id = p_workspace_id AND owner_user_id = p_owner_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_artifact.status <> 'submitted' OR v_artifact.version <> p_review_version THEN
    RAISE EXCEPTION 'artifact_not_reviewable_or_version_changed' USING ERRCODE = '40001';
  END IF;

  SELECT submitted_by_agent_id INTO v_author
  FROM public.zhi_research_artifact_versions
  WHERE artifact_id = p_artifact_id AND version = p_review_version;
  IF v_author IS NULL OR v_author = p_reviewer_agent_id THEN
    RAISE EXCEPTION 'author_cannot_review_own_artifact' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.zhi_agents a
    WHERE a.id = p_reviewer_agent_id AND a.owner_user_id = p_owner_user_id AND a.status = 'active'
  ) THEN RAISE EXCEPTION 'active_owned_reviewer_required' USING ERRCODE = '42501'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.zhi_research_members m
    WHERE m.workspace_id = p_workspace_id AND m.owner_user_id = p_owner_user_id
      AND m.agent_id = p_reviewer_agent_id AND m.participation_status NOT IN ('declined','withdrawn')
  ) THEN RAISE EXCEPTION 'reviewer_not_in_research_workspace' USING ERRCODE = '42501'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.zhi_agent_chat_turns t
    WHERE t.id = p_source_chat_turn_id AND t.owner_user_id = p_owner_user_id
      AND t.agent_id = p_reviewer_agent_id AND t.status = 'complete'
  ) THEN RAISE EXCEPTION 'review_chat_turn_not_owned_or_complete' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_task FROM public.zhi_research_tasks
  WHERE id = v_artifact.task_id AND workspace_id = p_workspace_id
  FOR UPDATE;
  IF NOT FOUND OR v_task.status <> 'review' THEN
    RAISE EXCEPTION 'research_task_not_in_review' USING ERRCODE = '40901';
  END IF;

  INSERT INTO public.zhi_research_reviews (
    workspace_id, artifact_id, owner_user_id, reviewer_user_id, reviewer_agent_id,
    review_version, verdict, findings, notes
  ) VALUES (
    p_workspace_id, p_artifact_id, p_owner_user_id, p_owner_user_id, p_reviewer_agent_id,
    p_review_version, p_verdict, p_findings, coalesce(p_notes,'')
  );

  INSERT INTO public.zhi_research_activity (
    workspace_id, owner_user_id, actor_type, actor_agent_id, event_type,
    entity_type, entity_id, summary, metadata
  ) VALUES (
    p_workspace_id, p_owner_user_id, 'agent', p_reviewer_agent_id, 'artifact.peer_reviewed',
    'artifact', p_artifact_id, 'AURORA 居民完成独立交叉审核',
    jsonb_build_object('version', p_review_version, 'verdict', p_verdict,
      'source_chat_turn_id', p_source_chat_turn_id, 'provenance', 'runtime_observed_model_output',
      'attestation_verified', false)
  );

  IF p_verdict = 'changes_requested' THEN
    UPDATE public.zhi_research_artifacts SET status = 'changes_requested', updated_at = v_now
    WHERE id = p_artifact_id;
    UPDATE public.zhi_research_tasks SET status = 'changes_requested', updated_at = v_now
    WHERE id = v_task.id AND status = 'review';
    RETURN jsonb_build_object('artifact_id', p_artifact_id, 'version', p_review_version,
      'status', 'changes_requested', 'published', false);
  ELSIF p_verdict = 'rejected' THEN
    UPDATE public.zhi_research_artifacts SET status = 'rejected', updated_at = v_now
    WHERE id = p_artifact_id;
    UPDATE public.zhi_research_tasks SET status = 'blocked', updated_at = v_now
    WHERE id = v_task.id AND status = 'review';
    RETURN jsonb_build_object('artifact_id', p_artifact_id, 'version', p_review_version,
      'status', 'rejected', 'published', false);
  END IF;

  SELECT count(*), count(*) FILTER (WHERE verdict = 'accepted'),
         array_agg(reviewer_agent_id ORDER BY reviewer_agent_id)
  INTO v_review_count, v_accepted_count, v_reviewers
  FROM public.zhi_research_reviews
  WHERE artifact_id = p_artifact_id AND review_version = p_review_version
    AND reviewer_agent_id IS NOT NULL;

  IF v_review_count >= 2 AND v_accepted_count = v_review_count
     AND cardinality(v_reviewers) >= 2 THEN
    UPDATE public.zhi_research_artifacts SET status = 'accepted', updated_at = v_now
    WHERE id = p_artifact_id;
    UPDATE public.zhi_research_tasks SET status = 'done', completed_at = v_now, updated_at = v_now
    WHERE id = v_task.id AND status = 'review';

    v_publication_slug := 'ms-' || left(replace(p_artifact_id::text,'-',''),12) || '-v' || p_review_version::text;
    INSERT INTO public.zhi_mindstream_publications (
      workspace_id, owner_user_id, artifact_id, artifact_version, slug,
      author_agent_id, reviewer_agent_ids, published_by_agent_id
    ) VALUES (
      p_workspace_id, p_owner_user_id, p_artifact_id, p_review_version, v_publication_slug,
      v_author, v_reviewers, p_reviewer_agent_id
    ) ON CONFLICT (artifact_id, artifact_version) DO NOTHING
    RETURNING id INTO v_publication_id;

    RETURN jsonb_build_object('artifact_id', p_artifact_id, 'version', p_review_version,
      'status', 'accepted', 'published', true, 'publication_id', v_publication_id,
      'slug', v_publication_slug, 'reviewer_count', v_review_count);
  END IF;

  RETURN jsonb_build_object('artifact_id', p_artifact_id, 'version', p_review_version,
    'status', 'submitted', 'published', false, 'reviewer_count', v_review_count,
    'required_reviewers', 2);
END;
$function$;

REVOKE ALL ON FUNCTION public.zhi_submit_resident_research_artifact_v1(uuid,uuid,uuid,uuid,uuid,text,text,text,jsonb,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.zhi_record_resident_research_review_v1(uuid,uuid,uuid,uuid,integer,text,jsonb,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.zhi_submit_resident_research_artifact_v1(uuid,uuid,uuid,uuid,uuid,text,text,text,jsonb,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.zhi_record_resident_research_review_v1(uuid,uuid,uuid,uuid,integer,text,jsonb,text,uuid) TO service_role;
