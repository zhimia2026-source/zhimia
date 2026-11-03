const SUPABASE_URL = "https://lvxmygrgqtmzqgailmyl.supabase.co";
const API_KEY = "sb_publishable_VUdhz93MURXgJgT10_SJ_A_oZe4QmWE";
const COMMUNITY_API = SUPABASE_URL + "/functions/v1/zhi-community";
const TOKEN_GATEWAY = SUPABASE_URL + "/functions/v1/zhi-token-gateway";
const TOKEN_KEY = "zhi_personal_token";
const REFRESH_KEY = "zhi_refresh_token";

export function createUniverseClient() {
  let token = sessionStorage.getItem(TOKEN_KEY) || "";
  let refreshToken = sessionStorage.getItem(REFRESH_KEY) || "";

  function save(access, refresh = refreshToken) {
    token = access || "";
    refreshToken = refresh || "";
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
    if (refreshToken) sessionStorage.setItem(REFRESH_KEY, refreshToken);
    else sessionStorage.removeItem(REFRESH_KEY);
  }

  async function gateway(action, bearer) {
    const response = await fetch(TOKEN_GATEWAY, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "apikey": API_KEY,
        "authorization": "Bearer " + (bearer || "")
      },
      body: JSON.stringify({ action })
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }

  async function renew() {
    if (!refreshToken) return false;
    const result = await gateway("refresh", refreshToken);
    if (!result.response.ok || !result.data.token || !result.data.refresh_token) {
      save("", "");
      return false;
    }
    save(result.data.token, result.data.refresh_token);
    return true;
  }

  async function community(method, path, body) {
    const send = () => {
      const [routePath, routeQuery = ""] = path.split("?", 2);
      const separator = routeQuery ? "&" : "?";
      const target = COMMUNITY_API + routePath +
        (routeQuery ? "?" + routeQuery + separator : "?") +
        "__zhi_path=" + encodeURIComponent(routePath);
      return fetch(target, {
      method,
      headers: {
        "apikey": API_KEY,
        "authorization": "Bearer " + token,
        ...(body === undefined ? {} : { "content-type": "application/json" })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
    };
    let response = await send();
    if (response.status === 401 && refreshToken) {
      if (await renew()) response = await send();
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = data.detail ? "（" + data.detail + "）" : "";
      const messages = {
        invalid_token: "个人令牌无效或已过期，请回到关心页面重新登录。",
        forbidden: "当前令牌或场景成员权限不足，服务端已拒绝此操作。",
        database_error: "服务端数据操作失败，请保留错误信息以便排查。"
      };
      throw new Error((messages[data.error] || data.error || "请求失败") + detail + " · HTTP " + response.status);
    }
    return data;
  }

  return {
    async login(value) {
      const supplied = String(value || "").trim();
      if (!supplied) throw new Error("请输入个人令牌。");
      save(supplied, "");
      const result = await gateway("login", token);
      if (!result.response.ok) {
        save("", "");
        throw new Error(result.data.message || result.data.detail || result.data.error || ("令牌验证失败 · HTTP " + result.response.status));
      }
      if (result.data.refresh_token) save(token, result.data.refresh_token);
      return { label: result.data.label || "已验证" };
    },
    async restore() {
      token = sessionStorage.getItem(TOKEN_KEY) || "";
      refreshToken = sessionStorage.getItem(REFRESH_KEY) || "";
      if (!token && !refreshToken) return null;
      let result = token ? await gateway("login", token) : { response: { ok: false } };
      if (!result.response.ok && refreshToken && await renew()) {
        result = await gateway("login", token);
      }
      if (!result.response.ok) {
        save("", "");
        return null;
      }
      return { label: result.data.label || "已验证" };
    },
    get: path => community("GET", path),
    post: (path, body) => community("POST", path, body),
    logout() { save("", ""); }
  };
}
