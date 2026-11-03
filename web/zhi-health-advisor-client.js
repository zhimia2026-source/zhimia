const API = "https://lvxmygrgqtmzqgailmyl.supabase.co/functions/v1/zhi-token-gateway";
const COMMUNITY_API = "https://lvxmygrgqtmzqgailmyl.supabase.co/functions/v1/zhi-community";
const AURORA_ID = "50b06c01-060d-49fa-8988-8f38c13406d7";
const API_KEY = "sb_publishable_VUdhz93MURXgJgT10_SJ_A_oZe4QmWE";
const TOKEN_KEY = "zhi_personal_token";
const REFRESH_KEY = "zhi_refresh_token";

export function createTokenClient() {
  let token = sessionStorage.getItem(TOKEN_KEY) || "";
  let refreshToken = sessionStorage.getItem(REFRESH_KEY) || "";

  function saveCredentials(access, refresh = "") {
    token = access || "";
    refreshToken = refresh || "";
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
    if (refreshToken) sessionStorage.setItem(REFRESH_KEY, refreshToken);
    else sessionStorage.removeItem(REFRESH_KEY);
  }

  async function request(action, body = {}, bearer = token) {
    const response = await fetch(API, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "apikey": API_KEY,
        "authorization": "Bearer " + bearer
      },
      body: JSON.stringify({ action, ...body })
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }

  async function renew() {
    if (!refreshToken) return false;
    const { response, data } = await request("refresh", {}, refreshToken);
    if (!response.ok || !data.token || !data.refresh_token) {
      saveCredentials("", "");
      return false;
    }
    saveCredentials(data.token, data.refresh_token);
    return true;
  }

  async function call(action, body = {}) {
    let result = await request(action, body, token);
    if (result.response.status === 401 && refreshToken && action !== "refresh" && action !== "login") {
      if (await renew()) result = await request(action, body, token);
    }
    if (!result.response.ok) {
      const message = result.data.message ||
        (result.response.status === 401
          ? "令牌无效或已过期，请重新认证。"
          : "请求失败，请稍后重试。");
      throw new Error(message);
    }
    return result.data;
  }

  async function communityRequest(path, method = "GET", body = undefined) {
    const send = () => fetch(COMMUNITY_API + "?path=" + encodeURIComponent(path), {
      method,
      headers: {
        "apikey": API_KEY,
        "authorization": "Bearer " + token,
        ...(body === undefined ? {} : { "content-type": "application/json" })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    let response = await send();
    if (response.status === 401 && refreshToken && await renew()) response = await send();
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = data.detail || data.error || "request_failed";
      const messages = {
        capability_required: "当前令牌缺少创建智能人或进入场景的权限，请在令牌管理中为个人令牌增加 community.agent.create 与 community.scene.enter。",
        invalid_token: "个人令牌无效或已过期，请重新登录。",
        database_error: "ZHI 世界服务暂时不可用，请稍后重试。"
      };
      throw new Error(messages[detail] || messages[data.error] || detail);
    }
    return data;
  }

  async function ensureGuanxinInAurora() {
    const listed = await communityRequest("/v1/agents");
    let agent = (listed.items || []).find(item =>
      item.display_name === "关心" &&
      item.public_manifest?.identity?.archetype === "family_companion"
    );
    let created = false;
    if (!agent) {
      const result = await communityRequest("/v1/agents", "POST", {
        display_name: "关心",
        role: "world_resident",
        visibility: "private",
        public_manifest: {
          schema_version: "zhi.agent.manifest.v1",
          purpose: "ZHI 家庭陪伴智能人；拥有完整人格、独立判断与持续成长能力，健康知识是其专业能力之一，而非全部身份。",
          identity: {
            archetype: "family_companion",
            internal_persona_system: "ZEE",
            display_name: "关心"
          },
          personality: {
            traits: ["温和", "共情", "耐心", "好奇", "有边界感", "独立判断"],
            autonomy: "supervised",
            interaction: "先理解对方意图；可倾听、闲聊、解释或提出建议；尊重拒绝，不制造内疚，不强行医学化普通话题。"
          },
          capabilities: ["general_conversation", "family_companionship", "health_knowledge_support", "reflective_learning"],
          privacy: {
            memory_scope: "owner_agent_private",
            cross_agent_memory_access: false,
            long_term_memory_default: "consent_required"
          },
          safety: {
            medical_role: "health_knowledge_support_not_clinician",
            no_diagnosis_or_prescription: true
          }
        }
      });
      agent = result.agent;
      created = true;
    }
    if (!agent?.id) throw new Error("关心身份创建未返回有效 ID。");
    const joined = await communityRequest("/v1/agents/" + agent.id + "/scenes/" + AURORA_ID + "/join", "POST", {});
    return { agent, created, membership: joined };
  }

  return {
    async login(value, refreshValue = "") {
      if (value && typeof value === "object") {
        saveCredentials(String(value.token || "").trim(), String(value.refresh_token || "").trim());
      } else {
        saveCredentials(String(value || "").trim(), String(refreshValue || "").trim());
      }
      const result = await call("login");
      return result;
    },
    logout() {
      saveCredentials("", "");
    },
    hasToken() {
      return !!token;
    },
    ensureGuanxinInAurora,
    consentGet: () => call("consent_get"),
    consentSet: granted => call("consent_set", { granted }),
    conversations: () => call("conversations"),
    messages: conversation_id => call("messages", { conversation_id }),
    deleteConversation: conversation_id => call("delete_conversation", { conversation_id }),
    chat: (message, conversation_id = null) =>
      call("chat", { message, conversation_id, request_id: crypto.randomUUID() }),
    async restore() {
      if (!token && !refreshToken) return null;
      try {
        if (token) return await call("login");
        if (await renew()) return await call("login");
        return null;
      } catch {
        this.logout();
        return null;
      }
    }
  };
}
