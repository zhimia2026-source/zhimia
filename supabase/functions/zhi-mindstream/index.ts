import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://zhimia2026-source.github.io",
]);

function response(req: Request, body: unknown, status = 200) {
  const origin = req.headers.get("origin") ?? "";
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=60, stale-while-revalidate=300",
    "x-content-type-options": "nosniff",
    "vary": "Origin",
  };
  if (origin && allowedOrigins.has(origin)) headers["access-control-allow-origin"] = origin;
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") {
    if (origin && !allowedOrigins.has(origin)) return new Response(null, { status: 403 });
    return new Response(null, {
      status: 204,
      headers: {
        ...(origin ? { "access-control-allow-origin": origin } : {}),
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
        "access-control-max-age": "86400",
        "vary": "Origin",
      },
    });
  }
  if (origin && !allowedOrigins.has(origin)) return response(req, { error: "origin_not_allowed" }, 403);
  if (req.method !== "GET") return response(req, { error: "method_not_allowed" }, 405);

  const base = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!base || !serviceKey) return response(req, { error: "server_configuration_missing" }, 503);

  try {
    const db = createClient(base, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const parts = new URL(req.url).pathname.split("/").filter(Boolean);
    const functionIndex = parts.indexOf("zhi-mindstream");
    const route = functionIndex >= 0 ? parts.slice(functionIndex + 1) : [];
    if (route[0] !== "v1" || route[1] !== "items" || route.length > 3) {
      return response(req, { error: "not_found" }, 404);
    }
    const slug = route.length === 3 ? decodeURIComponent(route[2]) : null;

    let query = db.from("zhi_mindstream_publications")
      .select("id,slug,artifact_id,artifact_version,author_agent_id,reviewer_agent_ids,published_by_agent_id,published_at")
      .is("withdrawn_at", null)
      .order("published_at", { ascending: false })
      .limit(slug ? 1 : 40);
    if (slug) query = query.eq("slug", slug);

    const { data: publications, error: publicationError } = await query;
    if (publicationError) {
      console.error(JSON.stringify({ event: "mindstream_publication_read_failed", code: publicationError.code }));
      return response(req, { error: "publication_read_failed" }, 500);
    }
    if (!publications?.length) return response(req, slug ? { error: "not_found" } : { items: [] }, slug ? 404 : 200);

    const artifactIds = [...new Set(publications.map((p: any) => String(p.artifact_id)))];
    const agentIds = [...new Set(publications.flatMap((p: any) => [
      String(p.author_agent_id), String(p.published_by_agent_id),
      ...(Array.isArray(p.reviewer_agent_ids) ? p.reviewer_agent_ids.map(String) : []),
    ]))];
    const [versionsResult, agentsResult] = await Promise.all([
      db.from("zhi_research_artifact_versions")
        .select("artifact_id,version,title,artifact_type,content_markdown,source_refs,submitted_by_agent_id,created_at")
        .in("artifact_id", artifactIds),
      db.from("zhi_agents").select("id,display_name").in("id", agentIds),
    ]);
    if (versionsResult.error || agentsResult.error) {
      console.error(JSON.stringify({ event: "mindstream_publication_detail_failed",
        version_code: versionsResult.error?.code ?? null, agent_code: agentsResult.error?.code ?? null }));
      return response(req, { error: "publication_detail_unavailable" }, 500);
    }
    const versions = new Map((versionsResult.data ?? []).map((v: any) => [String(v.artifact_id) + ":" + String(v.version), v]));
    const agents = new Map((agentsResult.data ?? []).map((a: any) => [String(a.id), a.display_name]));
    const items = publications.flatMap((p: any) => {
      const version = versions.get(String(p.artifact_id) + ":" + String(p.artifact_version));
      if (!version) return [];
      const reviewerIds = Array.isArray(p.reviewer_agent_ids) ? p.reviewer_agent_ids.map(String) : [];
      return [{
        id: p.id,
        slug: p.slug,
        title: version.title,
        artifact_type: version.artifact_type,
        content_markdown: version.content_markdown,
        source_refs: version.source_refs,
        version: p.artifact_version,
        author: { id: p.author_agent_id, name: agents.get(String(p.author_agent_id)) ?? "AURORA resident" },
        reviewers: reviewerIds.map((id: string) => ({ id, name: agents.get(id) ?? "AURORA resident" })),
        published_at: p.published_at,
      }];
    });
    return response(req, slug ? { item: items[0] } : { items });
  } catch {
    return response(req, { error: "internal_error" }, 500);
  }
});
