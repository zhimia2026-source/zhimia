/**
 * ZHI Health Advisor adapter for an existing Supabase-authenticated chat UI.
 *
 * Usage:
 *   import { createHealthAdvisorClient } from "./zhi-health-advisor-client.js";
 *   const healthAdvisor = createHealthAdvisorClient({ supabase });
 *
 * Do not pass a service-role key to this module. The supplied Supabase client
 * must use the project's publishable/anon key and the signed-in user's session.
 */
export function createHealthAdvisorClient({ supabase }) {
  if (!supabase?.auth || !supabase?.from || !supabase?.functions) {
    throw new Error("A signed-in Supabase client is required.");
  }

  async function requireUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) throw new Error("请先登录后再使用健康顾问。");
    return data.user;
  }

  async function getChatStorageConsent() {
    const user = await requireUser();
    const { data, error } = await supabase
      .from("zhi_health_consents")
      .select("id, granted, granted_at, revoked_at, policy_version")
      .eq("user_id", user.id)
      .eq("purpose", "chat_storage")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error("暂时无法读取聊天记录授权状态。");
    return Boolean(data?.granted && data?.granted_at && !data?.revoked_at);
  }

  async function setChatStorageConsent(granted) {
    const user = await requireUser();
    const now = new Date().toISOString();
    const { data: existing, error: readError } = await supabase
      .from("zhi_health_consents")
      .select("id")
      .eq("user_id", user.id)
      .eq("purpose", "chat_storage")
      .eq("policy_version", "v1.0")
      .maybeSingle();
    if (readError) throw new Error("暂时无法更新聊天记录授权。");

    const values = granted
      ? { granted: true, granted_at: now, revoked_at: null }
      : { granted: false, revoked_at: now };

    const result = existing
      ? await supabase.from("zhi_health_consents").update(values).eq("id", existing.id).eq("user_id", user.id)
      : await supabase.from("zhi_health_consents").insert({
          user_id: user.id,
          purpose: "chat_storage",
          policy_version: "v1.0",
          ...values,
        });
    if (result.error) throw new Error("授权状态更新失败，请稍后重试。");
    return { granted: Boolean(granted), changed_at: now };
  }

  async function sendMessage({ message, conversationId = null, requestId = crypto.randomUUID() }) {
    await requireUser();
    if (typeof message !== "string" || !message.trim()) {
      throw new Error("请先输入要咨询的内容。");
    }
    if (message.length > 6000) throw new Error("单条消息最多 6000 个字符。");

    const { data, error } = await supabase.functions.invoke("zhi-health-advisor", {
      body: {
        message: message.trim(),
        conversation_id: conversationId,
        request_id: requestId,
      },
    });
    if (error) {
      throw new Error("健康顾问暂时无法回应，请检查网络或稍后重试。");
    }
    if (data?.error) {
      throw new Error(data.message || "健康顾问暂时不可用。");
    }
    return data;
  }

  async function listConversations({ limit = 30 } = {}) {
    const user = await requireUser();
    const { data, error } = await supabase
      .from("zhi_health_conversations")
      .select("id, title, created_at, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(Math.min(Math.max(Number(limit) || 30, 1), 100));
    if (error) throw new Error("暂时无法读取会话列表。");
    return data || [];
  }

  async function listMessages({ conversationId, limit = 100 }) {
    const user = await requireUser();
    if (!conversationId) throw new Error("需要指定会话。");
    const { data, error } = await supabase
      .from("zhi_health_messages")
      .select("id, conversation_id, role, content, certainty_level, evidence_basis, limitations, safety_override, created_at")
      .eq("user_id", user.id)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(Math.min(Math.max(Number(limit) || 100, 1), 200));
    if (error) throw new Error("暂时无法读取会话消息。");
    return data || [];
  }

  return {
    getChatStorageConsent,
    setChatStorageConsent,
    sendMessage,
    listConversations,
    listMessages,
  };
}
