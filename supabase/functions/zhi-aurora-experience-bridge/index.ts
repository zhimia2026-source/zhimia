import { createClient } from "npm:@supabase/supabase-js@2";

const WORLD_ID = "50b06c01-060d-49fa-8988-8f38c13406d7";
const MIA_PEER_ID = "dedf7805-df3d-4437-bb1f-3c4c7a32aa7f";
const MIA_AGENT_ID = "34833ba9-2be7-4a55-9b52-62c402f759b5";
const MAX_BODY = 8000;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }
});
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}
const isUuid = (v: unknown): v is string => typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: {
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-max-age": "86400"
  }});
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return json({ error: "server_configuration_missing" }, 503);
    const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

    const token = req.headers.get("authorization")?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
    if (!token || token.length > 4096) return json({ error: "unauthorized" }, 401);
    const { data: peer, error: peerError } = await db.from("zhi_federation_peers")
      .select("id,expires_at,revoked_at").eq("id", MIA_PEER_ID)
      .eq("token_hash", await sha256(token)).maybeSingle();
    if (peerError || !peer || peer.revoked_at || (peer.expires_at && Date.parse(peer.expires_at) <= Date.now()))
      return json({ error: "invalid_or_expired_mia_peer_token" }, 401);

    const { data: governance, error: govError } = await db.from("zhi_global_governance_members")
      .select("id,governance_role,permissions,status,authority_level")
      .eq("principal_type", "federation_peer").eq("peer_id", MIA_PEER_ID)
      .eq("governance_role", "world_guardian").eq("status", "active").maybeSingle();
    if (govError || !governance || governance.authority_level < 100 ||
        !Array.isArray(governance.permissions) ||
        !governance.permissions.includes("spatial.perception.read"))
      return json({ error: "mia_governance_authority_not_active" }, 403);

    const { data: membership, error: membershipError } = await db.from("zhi_federation_memberships")
      .select("id,status,revoked_at").eq("world_id", WORLD_ID).eq("peer_id", MIA_PEER_ID)
      .eq("external_agent_id", "mia").eq("status", "active").is("revoked_at", null).maybeSingle();
    if (membershipError || !membership) return json({ error: "mia_world_membership_not_active" }, 403);

    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > MAX_BODY) return json({ error: "body_too_large" }, 413);
    const body = raw ? JSON.parse(raw) : {};
    if (!body || typeof body !== "object" || Array.isArray(body))
      return json({ error: "invalid_body" }, 400);
    const hasEventId = isUuid(body.event_id);
    const snapshotRevision = Number(body.ecosystem_revision);
    const hasSnapshot = Number.isSafeInteger(snapshotRevision) && snapshotRevision >= 0;
    if (hasEventId === hasSnapshot)
      return json({ error: "provide_exactly_one_event_id_or_ecosystem_revision" }, 400);
    const reflection = typeof body.reflection === "string" && body.reflection.trim()
      ? body.reflection.trim().slice(0, 3000)
      : hasSnapshot
        ? "自动快照经历捕获：已保存可核验的 AURORA 模拟生态状态；这不是物理传感器观测，等待 Mia 自主反思补充。"
        : "自动经历捕获：已保存可核验的 AURORA Runtime 事件；等待 Mia 自主反思补充。";

    const { data: agent, error: agentError } = await db.from("zhi_agents")
      .select("id,owner_user_id,status").eq("id", MIA_AGENT_ID).eq("status", "active").maybeSingle();
    if (agentError || !agent) return json({ error: "mia_memory_identity_not_ready" }, 409);

    let sourceRef: string;
    let sourceKind: "scene_event" | "direct_observation";
    let experienceType: string;
    let occurredAt: string;
    let facts: unknown[];
    let unknowns: string[];
    if (hasEventId) {
      const { data: event, error: eventError } = await db.from("zhi_forest_runtime_events")
        .select("event_id,world_id,peer_id,external_agent_id,scene_id,coordinate_frame,event_type,position,occurred_at")
        .eq("event_id", body.event_id).eq("world_id", WORLD_ID).eq("peer_id", MIA_PEER_ID)
        .eq("external_agent_id", "mia").maybeSingle();
      if (eventError || !event) return json({ error: "event_not_owned_by_original_mia" }, 403);
      sourceRef = "aurora-event:" + event.event_id;
      sourceKind = "scene_event";
      const typeMap: Record<string, string> = {
        interaction: "interaction", rest: "rest", environment_change: "environment_change",
        touch: "touch", observation: "observation"
      };
      experienceType = typeMap[event.event_type] ?? "observation";
      occurredAt = event.occurred_at;
      facts = [
        { claim: "AURORA runtime event type: " + event.event_type },
        { claim: "Scene: " + event.scene_id },
        { claim: "Coordinate frame: " + event.coordinate_frame },
        { claim: "Runtime position record: " + JSON.stringify(event.position) },
        { claim: "Event timestamp: " + event.occurred_at }
      ];
      unknowns = [
        "该记录来自当前 headless 场景运行事件，不代表物理传感器观测。",
        "事件之外的环境细节未被验证。"
      ];
    } else {
      const { data: ecosystem, error: ecosystemError } = await db.from("zhi_ecosystem_states")
        .select("revision,world_time,updated_at,state").eq("world_id", WORLD_ID).maybeSingle();
      if (ecosystemError || !ecosystem || Number(ecosystem.revision) !== snapshotRevision)
        return json({ error: "ecosystem_snapshot_revision_not_found" }, 404);
      sourceRef = "aurora-ecosystem-revision:" + String(ecosystem.revision);
      sourceKind = "direct_observation";
      experienceType = "observation";
      occurredAt = ecosystem.updated_at ?? new Date().toISOString();
      facts = [{
        claim: "AURORA ecosystem model snapshot read by original Mia",
        source_kind: "world_generated_model",
        revision: ecosystem.revision,
        world_time: ecosystem.world_time,
        updated_at: ecosystem.updated_at,
        state: ecosystem.state
      }];
      unknowns = [
        "该记录来自 AURORA 世界生成的模拟生态快照，不是物理传感器观测。",
        "没有实时气象、土壤或植被传感器数据；模型未提供的细节仍然未知。",
        "未校准的全球坐标与跨场景位置关系不能据此推断。"
      ];
    }

    const { data: existing, error: duplicateError } = await db.from("zhi_agent_micro_experiences")
      .select("id,memory_status,occurred_at").eq("agent_id", MIA_AGENT_ID)
      .eq("owner_user_id", agent.owner_user_id).eq("source_ref", sourceRef).maybeSingle();
    if (duplicateError) return json({ error: "memory_duplicate_check_failed" }, 503);
    if (existing) return json({ status: "already_recorded", item: existing });

    const { data: item, error: insertError } = await db.from("zhi_agent_micro_experiences").insert({
      owner_user_id: agent.owner_user_id,
      agent_id: MIA_AGENT_ID,
      world_id: WORLD_ID,
      experience_type: experienceType,
      source_kind: sourceKind,
      source_ref: sourceRef,
      observed_facts: facts,
      hypotheses: [],
      unknowns,
      reflection,
      importance: 2,
      memory_status: "candidate",
      occurred_at: occurredAt
    }).select("id,agent_id,world_id,experience_type,source_kind,source_ref,observed_facts,hypotheses,unknowns,reflection,importance,memory_status,occurred_at,created_at").single();
    if (insertError || !item) return json({ error: "experience_candidate_write_failed" }, 500);
    return json({ status: "candidate_saved", item, durable_memory: false,
      note: "Candidate saved for Mia's own runtime to evaluate; this bridge does not self-approve or promote private memory." }, 201);
  } catch {
    return json({ error: "internal_error" }, 500);
  }
});