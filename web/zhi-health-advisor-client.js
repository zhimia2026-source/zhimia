const API = "https://lvxmygrgqtmzqgailmyl.supabase.co/functions/v1/zhi-token-gateway";
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
