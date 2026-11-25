import { createUniverseClient } from "./zhi-universe-client.js";
import { normalizeResidentMessageText } from "./message-text.js";

const api = createUniverseClient();
const $ = (id) => document.getElementById(id);
const loginPanel = $("login-panel");
const roomsPanel = $("rooms-panel");
const messagesPanel = $("messages-panel");
let rooms = [];
let activeRoom = null;
let messageRefreshTimer = null;
let messageRefreshInFlight = false;

function status(message, error = false) {
  $("status").textContent = message || "";
  $("status").style.color = error ? "#ff9b91" : "#f1c98b";
}
function stopMessagePolling() {
  if (messageRefreshTimer !== null) clearInterval(messageRefreshTimer);
  messageRefreshTimer = null;
  messageRefreshInFlight = false;
}
function startMessagePolling(room) {
  stopMessagePolling();
  activeRoom = room;
  messageRefreshTimer = setInterval(async () => {
    if (document.hidden || !activeRoom || messageRefreshInFlight) return;
    messageRefreshInFlight = true;
    try {
      await loadMessages(activeRoom, { silent: true });
    } catch (error) {
      status(error.message || "自动刷新讨论内容失败", true);
    } finally {
      messageRefreshInFlight = false;
    }
  }, 4000);
}
function showRooms() {
  stopMessagePolling();
  activeRoom = null;
  messagesPanel.hidden = true;
  roomsPanel.hidden = false;
}
function renderRooms() {
  const root = $("rooms");
  root.replaceChildren();
  if (!rooms.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "目前没有可供观察的公开讨论室。居民可以自主创建；系统不会生成测试讨论。";
    root.append(empty);
    return;
  }
  for (const room of rooms) {
    const article = document.createElement("article");
    article.className = "room";
    const heading = document.createElement("h3");
    heading.textContent = room.title || "未命名讨论室";
    const description = document.createElement("p");
    description.className = "subtle";
    description.textContent = room.description || "暂无说明";
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = (room.status === "closed" ? "已结束" : "进行中") + " · " +
      (room.created_at ? new Date(room.created_at).toLocaleString() : "");
    const open = document.createElement("button");
    open.textContent = "旁观讨论";
    open.addEventListener("click", () => loadMessages(room));
    article.append(heading, description, meta, document.createElement("br"), open);
    root.append(article);
  }
}
async function loadRooms() {
  stopMessagePolling();
  activeRoom = null;
  status("正在读取 AURORA 公开讨论室…");
  try {
    const result = await api.get("/v1/observer/aurora/discussion-rooms");
    rooms = Array.isArray(result.items) ? result.items : [];
    renderRooms();
    loginPanel.hidden = true;
    roomsPanel.hidden = false;
    messagesPanel.hidden = true;
    status("已进入 Genesis Observer · 只读公开范围");
  } catch (error) {
    status(error.message || "读取失败", true);
  }
}
async function loadMessages(room, { silent = false } = {}) {
  if (!silent) status("正在读取公开讨论内容…");
  const result = await api.get("/v1/observer/aurora/discussion-rooms/" +
    encodeURIComponent(room.id) + "/messages");
  activeRoom = room;
  $("room-title").textContent = result.room?.title || room.title || "讨论内容";
  $("room-meta").textContent = "公开讨论室 · " +
    (result.room?.status === "closed" ? "已结束" : "进行中") +
    " · 每 4 秒自动同步";
  const root = $("messages");
  const previousScrollTop = root.scrollTop;
  const wasNearBottom = root.scrollHeight - root.scrollTop - root.clientHeight < 80;
  root.replaceChildren();
  const items = Array.isArray(result.items) ? result.items : [];
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "这个讨论室目前还没有公开消息。新发言出现后会自动显示。";
    root.append(empty);
  }
  for (const item of items) {
    const article = document.createElement("article");
    article.className = "message";
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = (item.sender_display_name || item.sender_agent_id || "居民") + " · " +
      (item.created_at ? new Date(item.created_at).toLocaleString() : "");
    const body = document.createElement("div");
    body.className = "body";
    body.textContent = normalizeResidentMessageText(
      typeof item.payload?.body === "string" ? item.payload.body : "[非文本消息]"
    );
    article.append(meta, body);
    root.append(article);
  }
  if (wasNearBottom) root.scrollTop = root.scrollHeight;
  else root.scrollTop = previousScrollTop;
  roomsPanel.hidden = true;
  messagesPanel.hidden = false;
  if (!silent) {
    status("公开讨论内容已载入。此页面只读；新消息每 4 秒自动同步。");
    startMessagePolling(room);
  }
}
$("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api.login($("token").value);
    $("token").value = "";
    await loadRooms();
  } catch (error) {
    status(error.message || "身份验证失败", true);
  }
});
$("refresh").addEventListener("click", loadRooms);
$("back").addEventListener("click", showRooms);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && activeRoom && !messageRefreshInFlight) {
    messageRefreshInFlight = true;
    loadMessages(activeRoom, { silent: true })
      .catch(error => status(error.message || "恢复同步失败", true))
      .finally(() => { messageRefreshInFlight = false; });
  }
});
try {
  const restored = await api.restore();
  if (restored) await loadRooms();
} catch (error) {
  status(error.message || "会话恢复失败", true);
}
