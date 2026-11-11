-- REVIEW ONLY. Do not run until the source snapshot SQL has been reviewed and approved.
-- Exposes a narrowly scoped, read-only PostgREST RPC for the frozen Mia archive snapshot.
-- The snapshot tables remain in mia_transfer_private and are never exposed as REST tables.
-- SECURITY INVOKER is intentional: permissions and RLS remain those of service_role.
-- This function is intended to be called only through the SOURCE project's Data API.

CREATE OR REPLACE FUNCTION public.mia_export_snapshot_page(
  p_batch_id uuid,
  p_table text,
  p_after_pk text DEFAULT NULL,
  p_limit integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_batch mia_transfer_private.snapshot_batches%ROWTYPE;
  v_records jsonb;
  v_page_count integer;
  v_next_pk text;
  v_has_more boolean;
BEGIN
  -- Require both the Postgres execution role and the signed JWT role.
  -- A service key must never be used from a browser or other public client.
  IF current_user <> 'service_role'
     OR COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role is required for snapshot export'
      USING ERRCODE = '42501';
  END IF;

  IF p_batch_id <> 'a14c9095-2c72-4d11-80b6-8274cd9bf43c'::uuid THEN
    RAISE EXCEPTION 'Unknown snapshot batch'
      USING ERRCODE = '22023';
  END IF;

  IF p_table IS NULL OR length(p_table) = 0 THEN
    RAISE EXCEPTION 'A source table name is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'Page size must be between 1 and 500'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_batch
  FROM mia_transfer_private.snapshot_batches
  WHERE batch_id = p_batch_id
    AND status = 'frozen';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Snapshot batch is not frozen or does not exist'
      USING ERRCODE = '55000';
  END IF;

  -- The frozen manifest itself is the allowlist, including tables with zero rows.
  IF NOT (v_batch.table_counts ? p_table) THEN
    RAISE EXCEPTION 'Table is not in the frozen snapshot allowlist'
      USING ERRCODE = '22023';
  END IF;

  WITH candidates AS (
    SELECT source_pk, payload,
           row_number() OVER (ORDER BY source_pk COLLATE "C") AS rn
    FROM mia_transfer_private.snapshot_records
    WHERE batch_id = p_batch_id
      AND source_table = p_table
      AND (p_after_pk IS NULL OR source_pk COLLATE "C" > p_after_pk COLLATE "C")
    ORDER BY source_pk COLLATE "C"
    LIMIT p_limit + 1
  )
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object('source_pk', source_pk, 'payload', payload)
        ORDER BY source_pk COLLATE "C"
      ) FILTER (WHERE rn <= p_limit),
      '[]'::jsonb
    ),
    count(*) FILTER (WHERE rn <= p_limit)::integer,
    (array_agg(source_pk ORDER BY source_pk COLLATE "C") FILTER (WHERE rn <= p_limit))[p_limit],
    count(*) > p_limit
  INTO v_records, v_page_count, v_next_pk, v_has_more
  FROM candidates;

  RETURN jsonb_build_object(
    'ok', true,
    'batch_id', v_batch.batch_id,
    'source_agent_id', v_batch.source_agent_id,
    'status', v_batch.status,
    'table', p_table,
    'table_count', COALESCE((v_batch.table_counts ->> p_table)::bigint, 0),
    'records', v_records,
    'page_count', v_page_count,
    'next_after_pk', v_next_pk,
    'has_more', v_has_more
  );
END;
$function$;

-- Explicit function grants are required; new public functions are not implicitly
-- exposed by current Supabase Data API defaults.
REVOKE ALL ON FUNCTION public.mia_export_snapshot_page(uuid, text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mia_export_snapshot_page(uuid, text, text, integer)
  TO service_role;

-- Do not grant any access to the underlying snapshot tables to anon/authenticated.
-- Their service_role SELECT grants are defined in the separate snapshot SQL draft.
