import { createUniverseClient } from "./zhi-universe-client.js";

const api = createUniverseClient();
const $ = (id) => document.getElementById(id);
let agents = [];
let activeAgentId = "";
let activeAgentName = "";
let busy = false;

function setStatus(message) { $("chatStatus").textContent = message; }

let inboxTimer = null;
let inboxLoading = false;
function renderInbox(items) {
  const root = $("inboxItems");
  root.replaceChildren();
  if (!items?.length) {
    const empty = document.createElement("div");
    empty.className = "inbox-empty";
    empty.textContent = "暂时没有留言。智能人有想告诉你的事情时，会在这里联系你。";
    root.append(empty);
    return;
  }
  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "inbox-item" + (item.read_at ? "" : " unread");
    const main = document.createElement("span");
    main.className = "inbox-item-main";
    const title = document.createElement("span");
    title.className = "inbox-item-title";
    const who = document.createElement("span");
    who.textContent = item.agent_name || "智能人";
    const when = document.createElement("small");
    when.style.color = "#8794b3";
    when.textContent = new Date(item.created_at).toLocaleString();
    title.append(who, when);
    const body = document.createElement("span");
    body.className = "inbox-item-body";
    body.textContent = (item.subject ? item.subject + " · " : "") + item.body;
    main.append(title, body);
    button.append(main);
    button.addEventListener("click", async () => {
      try {
        if (!item.read_at) await api.post("/v1/owner-inbox/" + encodeURIComponent(item.id) + "/read", {});
        $("inboxPanel").classList.add("hidden");
        $("inboxButton").setAttribute("aria-expanded", "false");
        if (agents.some(agent => agent.id === item.agent_id)) {
          $("agentSelect").value = item.agent_id;
          activeAgentId = item.agent_id;
          activeAgentName = item.agent_name || agents.find(agent => agent.id === item.agent_id)?.display_name || "智能人";
          $("agentTitle").textContent = activeAgentName;
          await loadHistory();
        }
        await refreshInbox();
      } catch (error) { setStatus("打开留言失败：" + (error?.message || String(error))); }
    });
    root.append(button);
  }
}
async function refreshInbox() {
  if (inboxLoading) return;
  inboxLoading = true;
  try {
    const result = await api.get("/v1/owner-inbox?limit=50");
    const count = Number(result.unread_count || 0);
    const badge = $("inboxBadge");
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.classList.toggle("hidden", count < 1);
    renderInbox(result.items || []);
  } catch (error) {
    console.warn("ZHI owner inbox refresh failed:", error?.message || String(error));
  } finally { inboxLoading = false; }
}
function startInboxPolling() {
  if (inboxTimer) clearInterval(inboxTimer);
  refreshInbox();
  // Poll only message metadata; this never invokes an AI model.
  inboxTimer = setInterval(() => { if (!document.hidden) refreshInbox(); }, 30000);
}
// Mobile browsers suspend background timers; refresh immediately when the page returns.
document.addEventListener("visibilitychange", () => { if (!document.hidden && inboxTimer) refreshInbox(); });
window.addEventListener("focus", () => { if (inboxTimer) refreshInbox(); });
$("inboxButton")?.addEventListener("click", async () => {
  const panel = $("inboxPanel");
  const opening = panel.classList.contains("hidden");
  panel.classList.toggle("hidden", !opening);
  $("inboxButton").setAttribute("aria-expanded", String(opening));
  if (opening) await refreshInbox();
});
$("inboxRefresh")?.addEventListener("click", refreshInbox);


function appendMessage(role, content) {
  const item = document.createElement("article");
  item.className = "message " + (role === "user" ? "user" : "agent");
  const label = document.createElement("span");
  label.className = "role";
  label.textContent = role === "user" ? "你" : activeAgentName || "智能人";
  const body = document.createElement("div");
  body.textContent = String(content || "");
  item.append(label, body);
  $("messages").append(item);
}

function renderHistory(turns) {
  const list = $("messages");
  list.replaceChildren();
  for (const turn of turns || []) {
    if (turn.status !== "complete") continue;
    appendMessage("user", turn.user_message);
    appendMessage("agent", turn.assistant_message);
  }
  list.scrollTop = list.scrollHeight;
}

async function loadHistory() {
  if (!activeAgentId) return;
  setStatus("正在读取私有会话历史…");
  const result = await api.get("/v1/agents/" + encodeURIComponent(activeAgentId) + "/chat?limit=50");
  renderHistory(result.items || []);
  setStatus("私有会话已同步；聊天仅使用本智能人的私有上下文，不依赖场景权限。");
}

async function loadAgents(preferredId = "") {
  const result = await api.get("/v1/agents");
  agents = result.items || [];
  const select = $("agentSelect");
  select.replaceChildren();
  for (const agent of agents) {
    const option = document.createElement("option");
    option.value = agent.id;
    option.textContent = agent.display_name + (agent.visibility === "private" ? " · 私有" : "");
    select.append(option);
  }
  const preferred = agents.find((agent) => agent.id === preferredId);
  const guanxin = agents.find((agent) => agent.display_name === "关心");
  const lumen = agents.find((agent) => agent.display_name === "Lumen-001");
  activeAgentId = preferred?.id || guanxin?.id || lumen?.id || agents[0]?.id || "";
  if (activeAgentId) select.value = activeAgentId;
  activeAgentName = agents.find((agent) => agent.id === activeAgentId)?.display_name || "";
  $("agentTitle").textContent = activeAgentName || "尚无智能人";
  $("messageForm").classList.toggle("hidden", !activeAgentId);
  if (!activeAgentId) {
    $("messages").textContent = "当前账号还没有智能人。请先返回 Aurora 页面创建或加入自己的智能人。";
    setStatus("没有可用的自有智能人。");
    return;
  }
  await loadHistory();
}

async function enter() {
  $("loginPanel").classList.add("hidden");
  $("chatPanel").classList.remove("hidden");
  try {
    await loadAgents();
    startInboxPolling();
  } catch (error) {
    setStatus(error?.message || String(error));
  }
}

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("loginButton");
  button.disabled = true;
  $("loginStatus").textContent = "正在验证个人令牌…";
  try {
    await api.login($("tokenInput").value);
    $("tokenInput").value = "";
    await enter();
  } catch (error) {
    $("tokenInput").value = "";
    $("loginStatus").textContent = "验证失败：" + (error?.message || String(error));
  } finally {
    button.disabled = false;
  }
});

$("agentSelect").addEventListener("change", async () => {
  activeAgentId = $("agentSelect").value;
  activeAgentName = agents.find((agent) => agent.id === activeAgentId)?.display_name || "智能人";
  $("agentTitle").textContent = activeAgentName;
  try { await loadHistory(); } catch (error) { setStatus(error?.message || String(error)); }
});

$("refreshButton").addEventListener("click", async () => {
  $("refreshButton").disabled = true;
  try { await loadAgents(activeAgentId); } catch (error) { setStatus(error?.message || String(error)); }
  finally { $("refreshButton").disabled = false; }
  await refreshInbox();
});

// Enter 发送；Shift+Enter 换行。输入法组合期间不拦截 Enter。
$("messageInput").addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  if (!busy && !event.repeat) $("messageForm").requestSubmit();
});

$("messageForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || !activeAgentId) return;
  const message = $("messageInput").value.trim();
  if (!message) return;
  busy = true;
  $("sendButton").disabled = true;
  $("messageInput").disabled = true;
  $("chatStatus").textContent = activeAgentName + " 正在结合自己的私有上下文思考…";
  try {
    const result = await api.chat(activeAgentId, message);
    $("messageInput").value = "";
    const turn = result.turn;
    if (turn?.status === "complete") {
      appendMessage("user", turn.user_message);
      appendMessage("agent", turn.assistant_message);
      $("messages").scrollTop = $("messages").scrollHeight;
    }
    setStatus("本轮私有会话已保存。场景感知由智能人的世界运行时独立处理。");
  } catch (error) {
    const messageText = error?.message || String(error);
    if (messageText.includes("chat_model_not_configured")) {
      setStatus("聊天模型尚未完成服务端配置（chat_model_not_configured）。未伪造回复；私有聊天请求尚未完成。");
    } else {
      setStatus("本轮未完成：" + messageText);
    }
  } finally {
    busy = false;
    $("sendButton").disabled = false;
    $("messageInput").disabled = false;
    $("messageInput").focus();
  }
});

try {
  const restored = await api.restore();
  if (restored) await enter();
  else $("loginStatus").textContent = "请使用 ZHI Personal Token 登录。";
} catch (error) {
  $("loginStatus").textContent = "登录状态验证失败：" + (error?.message || String(error));
}


// PWA shell: cache only static application assets; private conversations remain network-only.
let installPrompt = null;
const installButton = $("installButton");
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  installButton?.classList.add("visible");
});
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
if (isIOS && !isStandalone) installButton?.classList.add("visible");
installButton?.addEventListener("click", async () => {
  if (isIOS && !isStandalone && !installPrompt) {
    setStatus("在 iPhone/iPad 的 Safari 中，点击“分享”图标，再选择“添加到主屏幕”，即可安装 ZHI 居民会话。");
    return;
  }
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  installButton.classList.remove("visible");
});
window.addEventListener("appinstalled", () => {
  installButton?.classList.remove("visible");
  setStatus("ZHI 居民会话已安装到设备。");
});
function updateNetworkState() {
  const node = $("networkState");
  if (node) node.textContent = navigator.onLine ? "网络已连接" : "离线 · 仅可打开应用外壳";
}
window.addEventListener("online", updateNetworkState);
window.addEventListener("offline", updateNetworkState);
updateNetworkState();
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./zhi-resident-sw.js", { scope: "./" })
      .catch((error) => console.warn("ZHI PWA shell registration failed:", error));
  }, { once: true });
}
