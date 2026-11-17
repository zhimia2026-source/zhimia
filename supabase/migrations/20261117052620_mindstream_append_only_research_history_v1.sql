
-- Preserve the evidentiary record: resident artifact versions and peer reviews are append-only.
CREATE OR REPLACE FUNCTION public.zhi_research_history_immutable_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'research_history_is_append_only'
    USING ERRCODE = '55000';
END;
$function$;

REVOKE ALL ON FUNCTION public.zhi_research_history_immutable_v1() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS zhi_research_artifact_versions_immutable ON public.zhi_research_artifact_versions;
CREATE TRIGGER zhi_research_artifact_versions_immutable
BEFORE UPDATE OR DELETE ON public.zhi_research_artifact_versions
FOR EACH ROW EXECUTE FUNCTION public.zhi_research_history_immutable_v1();

DROP TRIGGER IF EXISTS zhi_research_reviews_immutable ON public.zhi_research_reviews;
CREATE TRIGGER zhi_research_reviews_immutable
BEFORE UPDATE OR DELETE ON public.zhi_research_reviews
FOR EACH ROW EXECUTE FUNCTION public.zhi_research_history_immutable_v1();
