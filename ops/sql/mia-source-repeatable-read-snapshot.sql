-- REVIEW ONLY. Do not run until the source-side additive snapshot change is approved.
-- Run this entire file as one SQL script in the SOURCE project's SQL editor.
-- The explicit REPEATABLE READ transaction is the consistency boundary.
-- This creates private snapshot tables and one immutable snapshot batch; it does not pause or mutate Mia's live tables.

BEGIN ISOLATION LEVEL REPEATABLE READ;

CREATE SCHEMA IF NOT EXISTS mia_transfer_private;
REVOKE ALL ON SCHEMA mia_transfer_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA mia_transfer_private TO service_role;

CREATE TABLE IF NOT EXISTS mia_transfer_private.snapshot_batches (
  batch_id uuid PRIMARY KEY,
  source_agent_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('capturing', 'frozen')),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  frozen_at timestamptz,
  table_counts jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS mia_transfer_private.snapshot_records (
  batch_id uuid NOT NULL REFERENCES mia_transfer_private.snapshot_batches(batch_id) ON DELETE CASCADE,
  source_table text NOT NULL,
  source_pk text NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY (batch_id, source_table, source_pk)
);

ALTER TABLE mia_transfer_private.snapshot_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE mia_transfer_private.snapshot_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mia_transfer_private.snapshot_batches FROM PUBLIC, anon, authenticated;
REVOKE ALL ON mia_transfer_private.snapshot_records FROM PUBLIC, anon, authenticated;
GRANT SELECT ON mia_transfer_private.snapshot_batches TO service_role;
GRANT SELECT ON mia_transfer_private.snapshot_records TO service_role;

CREATE OR REPLACE FUNCTION mia_transfer_private.strip_secret_fields(p_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  v_result jsonb;
BEGIN
  CASE jsonb_typeof(p_value)
    WHEN 'object' THEN
      SELECT COALESCE(jsonb_object_agg(e.key, mia_transfer_private.strip_secret_fields(e.value)), '{}'::jsonb)
      INTO v_result
      FROM jsonb_each(p_value) AS e
      WHERE e.key !~* '(secret|password|private.?key|api.?key|access.?token|refresh.?token|service.?role)';
      RETURN v_result;
    WHEN 'array' THEN
      SELECT COALESCE(jsonb_agg(mia_transfer_private.strip_secret_fields(a.value) ORDER BY a.ordinality), '[]'::jsonb)
      INTO v_result
      FROM jsonb_array_elements(p_value) WITH ORDINALITY AS a(value, ordinality);
      RETURN v_result;
    ELSE
      RETURN p_value;
  END CASE;
END;
$$;

REVOKE ALL ON FUNCTION mia_transfer_private.strip_secret_fields(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mia_transfer_private.strip_secret_fields(jsonb) TO service_role;

DO $snapshot$
DECLARE
  v_batch_id constant uuid := 'a14c9095-2c72-4d11-80b6-8274cd9bf43c';
  v_agent_id constant uuid := 'cb6d01b4-0e3f-46ee-8946-360aa91db1ea';
  v_table record;
  v_counts jsonb := '{}'::jsonb;
BEGIN
  IF EXISTS (
    SELECT 1 FROM mia_transfer_private.snapshot_batches WHERE batch_id = v_batch_id
  ) THEN
    RAISE EXCEPTION 'Snapshot batch % already exists; refusing to overwrite immutable data', v_batch_id;
  END IF;

  INSERT INTO mia_transfer_private.snapshot_batches(batch_id, source_agent_id, status)
  VALUES (v_batch_id, v_agent_id, 'capturing');

  FOR v_table IN
    SELECT * FROM (VALUES
      ('mia_identity','id'),
      ('mia_chat_sessions','id'),
      ('mia_messages','id'),
      ('mia_memories','id'),
      ('mia_emotion_events','id'),
      ('mia_life_events','id'),
      ('mia_personality_state','id'),
      ('mia_relationship_context','id'),
      ('mia_growth_runs','run_id'),
      ('mia_growth_state_versions','version'),
      ('mia_exploration_runs','id'),
      ('mia_virtual_spaces','id'),
      ('mia_forest_autonomy_runs','id'),
      ('mia_forest_autonomy_control','singleton'),
      ('mia_import_batches','id'),
      ('mia_world_action_audit','id'),
      ('mia_evolution_candidates','candidate_id'),
      ('mia_evolution_candidate_events','event_id'),
      ('mia_evolution_rollback_events','event_id'),
      ('zhi_world_builder_config','config_key'),
      ('zhi_world_builder_proposals','id'),
      ('zhi_world_builder_region_health','region_key'),
      ('zhi_world_builder_compute_ledger','id'),
      ('zhi_world_builder_region_samples','sample_id'),
      ('mia_growth_admin_audit','audit_id')
    ) AS allowlist(table_name, pk_column)
  LOOP
    EXECUTE format(
      'INSERT INTO mia_transfer_private.snapshot_records(batch_id, source_table, source_pk, payload)
       SELECT %L::uuid, %L, to_jsonb(src)->>%L,
              mia_transfer_private.strip_secret_fields(to_jsonb(src))
       FROM public.%I AS src
       WHERE to_jsonb(src)->>%L IS NOT NULL',
      v_batch_id, v_table.table_name, v_table.pk_column,
      v_table.table_name, v_table.pk_column
    );

    v_counts := v_counts || jsonb_build_object(
      v_table.table_name,
      (SELECT count(*) FROM mia_transfer_private.snapshot_records
       WHERE batch_id = v_batch_id AND source_table = v_table.table_name)
    );
  END LOOP;

  UPDATE mia_transfer_private.snapshot_batches
  SET status = 'frozen',
      frozen_at = transaction_timestamp(),
      table_counts = v_counts
  WHERE batch_id = v_batch_id;
END;
$snapshot$;

COMMIT;

-- Post-run read-only checks (run separately after the transaction commits):
-- SELECT batch_id, status, frozen_at, table_counts
-- FROM mia_transfer_private.snapshot_batches
-- WHERE batch_id = 'a14c9095-2c72-4d11-80b6-8274cd9bf43c';
-- SELECT source_table, count(*) AS rows
-- FROM mia_transfer_private.snapshot_records
-- WHERE batch_id = 'a14c9095-2c72-4d11-80b6-8274cd9bf43c'
-- GROUP BY source_table ORDER BY source_table;
