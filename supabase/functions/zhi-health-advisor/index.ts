import { createClient } from "npm:@supabase/supabase-js@2";
import { HEALTH_ADVISOR_SYSTEM_PROMPT } from "./prompt.ts";
import { detectSafetyOverride } from "./safety.ts";

const PROJECT_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const OPENAI_MODEL = Deno.env.get("ZHI_MODEL_NAME") ?? "gpt-4.1-mini";
const MAX_MESSAGE_CHARS = 6000;
const MAX_HISTORY = 12;
const RATE_LIMIT = 20;

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extraHeaders },
  });
}

function allowedOrigins(): string[] {
  return (Deno.env.get("ZHI_ALLOWED_ORIGINS") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
}

function corsHeaders(req: Request): Record<string, string> | null {
  const origin = req.headers.get("origin");
  if (!origin) return { "vary": "Origin" };
  if (!allowedOrigins().includes(origin)) return null;
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods": "POST, OPTIONS",
    "vary": "Origin",
  };
}

function serviceClient() {
  if (!PROJECT_URL || !SERVICE_ROLE_KEY) throw new Error("server_configuration_missing");
  return createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function callModel(history: Array<{ role: "user" | "assistant"; content: string }>) {
  if (!OPENAI_API_KEY) throw new Error("model_not_configured");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "authorization": `Bearer ${OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.2,
        max_tokens: 900,
        messages: [
          { role: "system", content: HEALTH_ADVISOR_SYSTEM_PROMPT },
          ...history,
        ],
      }),
    });
    if (!response.ok) {
      // Never log upstream response bodies because they may echo sensitive user content.
      throw new Error(response.status === 429 ? "model_rate_limited" : "model_provider_error");
    }
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new Error("empty_model_response");
    return content.trim().slice(0, 12000);
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (!cors) return json({ error: "origin_not_allowed" }, 403);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);

  const authHeader = req.headers.get("authorization");
  const bearer = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return json({ error: "authentication_required" }, 401, cors);
  if (!PROJECT_URL || !ANON_KEY) return json({ error: "server_configuration_missing" }, 503, cors);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400, cors);
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length > MAX_MESSAGE_CHARS) {
    return json({ error: "message_required_or_too_long", max_chars: MAX_MESSAGE_CHARS }, 400, cors);
  }
  const requestId = typeof body.request_id === "string" ? body.request_id : crypto.randomUUID();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    return json({ error: "request_id_must_be_uuid" }, 400, cors);
  }
  const conversationId = typeof body.conversation_id === "string" ? body.conversation_id : null;
  if (conversationId && !/^[0-9a-f-]{36}$/i.test(conversationId)) {
    return json({ error: "invalid_conversation_id" }, 400, cors);
  }

  // First verify the actual user with Auth; never trust a user_id sent in the request body.
  const authClient = createClient(PROJECT_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(bearer);
  const user = authData?.user;
  if (authError || !user) return json({ error: "invalid_session" }, 401, cors);

  let db: any;
  try {
    db = serviceClient();
  } catch {
    return json({ error: "server_configuration_missing" }, 503, cors);
  }

  // Rate limiting uses minimal request metadata and does not depend on chat-storage consent.
  const { error: rateInsertError } = await db.from("zhi_health_rate_events").insert({
    user_id: user.id,
    request_id: requestId,
  });
  if (rateInsertError) return json({ error: "rate_limit_unavailable" }, 503, cors);

  const windowStart = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count, error: rateError } = await db
    .from("zhi_health_rate_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", windowStart);
  if (rateError) return json({ error: "rate_limit_unavailable" }, 503, cors);
  if ((count ?? 0) > RATE_LIMIT) {
    return json({ error: "rate_limit_exceeded", retry_after_seconds: 600 }, 429, cors);
  }

  // Persisted chat history is opt-in. Without an active consent, answer using only this message and do not write chat content.
  const { data: storageConsent, error: consentError } = await db
    .from("zhi_health_consents")
    .select("id")
    .eq("user_id", user.id)
    .eq("purpose", "chat_storage")
    .eq("granted", true)
    .is("revoked_at", null)
    .order("granted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const canPersist = !consentError && Boolean(storageConsent);

  // Idempotent replay is allowed only when the user currently consents to chat storage.
  if (canPersist) {
    const { data: previousAnswer, error: previousError } = await db
      .from("zhi_health_messages")
      .select("content, certainty_level, evidence_basis, limitations, safety_override, conversation_id")
      .eq("user_id", user.id).eq("request_id", requestId).eq("role", "assistant").maybeSingle();
    if (!previousError && previousAnswer) {
      return json({
        conversation_id: previousAnswer.conversation_id,
        request_id: requestId,
        answer: previousAnswer.content,
        certainty_level: previousAnswer.certainty_level,
        evidence_basis: previousAnswer.evidence_basis,
        limitations: previousAnswer.limitations,
        safety_override: previousAnswer.safety_override,
        replayed: true,
      }, 200, cors);
    }
  }

  const safety = detectSafetyOverride(message);
  let answer: string;
  let certainty: "L0" | "L1" | "L2" | "L3" = "L0";
  let evidenceBasis: string[] = ["user_self_report"];
  let limitations = ["当前结论仅基于本次文字信息；不构成诊断或临床评估。"];
  let safetyOverride = false;

  if (safety.triggered) {
    answer = safety.response ?? "当前信息提示可能存在紧急风险。请优先联系当地紧急服务。";
    safetyOverride = true;
    evidenceBasis = safety.evidenceBasis;
    limitations = safety.limitations;
  } else {
    if (!OPENAI_API_KEY) {
      return json({
        error: "model_not_configured",
        message: "安全底座已部署，但尚未配置模型提供方密钥；普通健康问答暂不可用。紧急情况请直接联系当地急救服务。",
      }, 503, cors);
    }
    let history: Array<{ role: "user" | "assistant"; content: string }> = [];
    if (canPersist && existingConversationId) {
      const { data: previousMessages, error: historyError } = await db
        .from("zhi_health_messages")
        .select("role, content")
        .eq("user_id", user.id)
        .eq("conversation_id", existingConversationId)
        .order("created_at", { ascending: false })
        .limit(MAX_HISTORY);
      if (historyError) return json({ error: "conversation_history_unavailable" }, 503, cors);
      history = (previousMessages ?? []).reverse()
        .filter((item: { role: string; content: string }) => item.role === "user" || item.role === "assistant")
        .map((item: { role: "user" | "assistant"; content: string }) => ({ role: item.role, content: item.content }));
    }
    history.push({ role: "user", content: message });
    try {
      answer = await callModel(history);
      certainty = "L0"; // Model-generated claims are not independently verified; do not inflate certainty.
      evidenceBasis = ["user_self_report", "model_generated_explanation"];
      limitations = ["模型输出未经独立医学审核；请核实重要医疗决定。确定性等级不代表模型信心。"];
    } catch (error) {
      const code = error instanceof Error ? error.message : "model_provider_error";
      const publicMessage = code === "model_not_configured"
        ? "模型服务尚未配置。"
        : code === "model_rate_limited"
        ? "模型服务暂时繁忙，请稍后再试。"
        : "模型服务暂时不可用；本次内容未保存。";
      return json({ error: code, message: publicMessage }, 503, cors);
    }
  }

  // No explicit chat-storage consent: answer transiently and do not save health content.
  if (!canPersist) {
    return json({
      agent_id: "zhi-health-advisor-v1",
      conversation_id: null,
      request_id: requestId,
      answer,
      certainty_level: certainty,
      evidence_basis: evidenceBasis,
      limitations,
      safety_override: safetyOverride,
      memory_written: false,
      persisted: false,
      consent_required: "chat_storage",
    }, 200, cors);
  }

  // Persist only after a complete answer exists. The service-role client is server-only;
  // every query is explicitly scoped to the Auth-verified user_id.
  if (!existingConversationId) {
    const title = message.replace(/\s+/g, " ").slice(0, 60) || "健康生活咨询";
    const { data: created, error } = await db
      .from("zhi_health_conversations")
      .insert({ user_id: user.id, title })
      .select("id").single();
    if (error || !created) return json({ error: "conversation_save_failed" }, 503, cors);
    existingConversationId = created.id;
  }

  const { error: userMessageError } = await db.from("zhi_health_messages").upsert({
    user_id: user.id, conversation_id: existingConversationId, request_id: requestId,
    role: "user", content: message,
  }, { onConflict: "user_id,request_id,role", ignoreDuplicates: true });
  if (userMessageError) return json({ error: "message_save_failed" }, 503, cors);

  const { error: assistantMessageError } = await db.from("zhi_health_messages").upsert({
    user_id: user.id, conversation_id: existingConversationId, request_id: requestId,
    role: "assistant", content: answer, certainty_level: certainty,
    evidence_basis: evidenceBasis, limitations, safety_override: safetyOverride,
  }, { onConflict: "user_id,request_id,role", ignoreDuplicates: true });
  if (assistantMessageError) return json({ error: "answer_save_failed" }, 503, cors);

  // Audit metadata only; never write message text or medical details into this table.
  await db.from("zhi_health_audit_events").insert({
    user_id: user.id,
    event_type: safetyOverride ? "safety_override" : "chat_completed",
    resource_type: "conversation",
    resource_id: existingConversationId,
    details: { request_id: requestId, certainty_level: certainty },
  });

  return json({
    agent_id: "zhi-health-advisor-v1",
    conversation_id: existingConversationId,
    request_id: requestId,
    answer,
    certainty_level: certainty,
    evidence_basis: evidenceBasis,
    limitations,
    safety_override: safetyOverride,
    memory_written: false,
  }, 200, cors);
});
