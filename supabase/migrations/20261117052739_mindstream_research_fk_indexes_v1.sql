
CREATE INDEX IF NOT EXISTS zhi_mindstream_publications_workspace_idx
  ON public.zhi_mindstream_publications (workspace_id);
CREATE INDEX IF NOT EXISTS zhi_mindstream_publications_owner_idx
  ON public.zhi_mindstream_publications (owner_user_id);
CREATE INDEX IF NOT EXISTS zhi_mindstream_publications_author_idx
  ON public.zhi_mindstream_publications (author_agent_id);
CREATE INDEX IF NOT EXISTS zhi_mindstream_publications_publisher_idx
  ON public.zhi_mindstream_publications (published_by_agent_id);

CREATE INDEX IF NOT EXISTS zhi_research_artifact_versions_owner_idx
  ON public.zhi_research_artifact_versions (owner_user_id);
CREATE INDEX IF NOT EXISTS zhi_research_artifact_versions_author_idx
  ON public.zhi_research_artifact_versions (submitted_by_agent_id);

CREATE INDEX IF NOT EXISTS zhi_research_reviews_workspace_idx
  ON public.zhi_research_reviews (workspace_id);
CREATE INDEX IF NOT EXISTS zhi_research_reviews_owner_idx
  ON public.zhi_research_reviews (owner_user_id);
CREATE INDEX IF NOT EXISTS zhi_research_reviews_reviewer_user_idx
  ON public.zhi_research_reviews (reviewer_user_id);
CREATE INDEX IF NOT EXISTS zhi_research_reviews_reviewer_agent_idx
  ON public.zhi_research_reviews (reviewer_agent_id);
