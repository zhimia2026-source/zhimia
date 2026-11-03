import { createUniverseClient } from "./zhi-universe-client.js";

const api = createUniverseClient();
const $ = (id) => document.getElementById(id);
let agents = [];
let activeAgentId = "";
let busy = false;

function setStatus(message) { $("chatStatus").textContent = message; }

function appendMessage(role, content) {
  const item = document.createElement("article");
  item.className = "message " + (role === "user" ? "user" : "agent");
  const label = document.createElement("span");
  label.className = "role";
  label.textContent = role === "user" ? "你" : "Lumen-001";
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
  setStatus("私有会话已同步。");
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
  const lumen = agents.find((agent) => agent.display_name === "Lumen-001");
  activeAgentId = (agents.some((agent) => agent.id === preferredId) ? preferredId : lumen?.id) || agents[0]?.id || "";
  if (activeAgentId) select.value = activeAgentId;
  $("agentTitle").textContent = agents.find((agent) => agent.id === activeAgentId)?.display_name || "尚无智能人";
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
  $("agentTitle").textContent = agents.find((agent) => agent.id === activeAgentId)?.display_name || "智能人";
  try { await loadHistory(); } catch (error) { setStatus(error?.message || String(error)); }
});

$("refreshButton").addEventListener("click", async () => {
  $("refreshButton").disabled = true;
  try { await loadAgents(activeAgentId); } catch (error) { setStatus(error?.message || String(error)); }
  finally { $("refreshButton").disabled = false; }
});

$("messageForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || !activeAgentId) return;
  const message = $("messageInput").value.trim();
  if (!message) return;
  busy = true;
  $("sendButton").disabled = true;
  $("messageInput").disabled = true;
  $("chatStatus").textContent = "Lumen 正在结合私有上下文思考…";
  try {
    const result = await api.chat(activeAgentId, message);
    $("messageInput").value = "";
    const turn = result.turn;
    if (turn?.status === "complete") {
      appendMessage("user", turn.user_message);
      appendMessage("agent", turn.assistant_message);
      $("messages").scrollTop = $("messages").scrollHeight;
    }
    setStatus("本轮会话已保存。");
  } catch (error) {
    const messageText = error?.message || String(error);
    if (messageText.includes("chat_model_not_configured")) {
      setStatus("聊天模型尚未完成服务端配置（chat_model_not_configured）。会话没有伪造成功，也不会自动执行任何行动。");
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