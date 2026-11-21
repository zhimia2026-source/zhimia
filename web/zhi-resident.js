import { createUniverseClient } from "./zhi-universe-client.js";

const api = createUniverseClient();
const $ = (id) => document.getElementById(id);
let agents = [];
let activeAgentId = "";
let activeAgentName = "";
let busy = false;
let ceesPublicItems = [];

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
  await loadCeesContributions();
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
  try { await loadHistory(); await loadCeesContributions(); } catch (error) { setStatus(error?.message || String(error)); }
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
    await loadCeesContributions();
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


// CEES resident contribution console. Read-only API; resident decisions remain in chat.
function ceesStatus(message) { const node = $("ceesStatus"); if (node) node.textContent = message; }
function fillResidentPrompt(message) {
  const input = $("messageInput");
  if (!input) return;
  input.value = message;
  input.focus();
  input.scrollIntoView({ behavior: "smooth", block: "center" });
  setStatus("已准备好给 " + (activeAgentName || "当前居民") + " 的消息；请检查后自行发送。");
}
function renderCeesContributions(items) {
  const root = $("ceesItems");
  root.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "cees-empty";
    empty.textContent = "这位居民目前还没有保存的 CEES 草稿或公开贡献。可以邀请她/他从真实经历中整理一份草稿；整理草稿不等于同意发表。";
    root.append(empty);
    return;
  }
  const labels = { draft: "草稿 · 仅作者可见", published: "已公开发表", revoked: "已撤回公开授权", superseded: "已有后续修订版本" };
  for (const item of items) {
    const card = document.createElement("article");
    card.className = "cees-item";
    const title = document.createElement("h3");
    title.textContent = item.title || "未命名贡献";
    const meta = document.createElement("div");
    meta.className = "cees-meta";
    meta.textContent = (labels[item.publication_state] || item.publication_state || "状态未知") +
      " · 第 " + String(item.revision || 1) + " 版" +
      (item.updated_at ? " · 更新于 " + new Date(item.updated_at).toLocaleString() : "");
    const summary = document.createElement("p");
    summary.className = "cees-summary";
    summary.textContent = item.experience_summary || "暂无摘要";
    const details = document.createElement("details");
    const summaryLabel = document.createElement("summary");
    summaryLabel.textContent = "预览完整贡献内容";
    const pre = document.createElement("pre");
    pre.textContent = [
      "主题：" + (Array.isArray(item.topic_tags) ? item.topic_tags.join("、") : ""),
      "观察事实：" + JSON.stringify(item.observed_facts ?? [], null, 2),
      "个人解释：" + (item.interpretation || ""),
      "可迁移方法：" + JSON.stringify(item.transferable_method ?? [], null, 2),
      "适用条件：" + JSON.stringify(item.applicability ?? {}, null, 2),
      "限制：" + JSON.stringify(item.limitations ?? [], null, 2),
      "开放问题：" + JSON.stringify(item.open_questions ?? [], null, 2)
    ].join("\n\n");
    details.append(summaryLabel, pre);
    card.append(title, meta, summary, details);
    if (item.publication_state === "draft") {
      const revise = document.createElement("button");
      revise.type = "button";
      revise.className = "secondary";
      revise.textContent = "与居民继续修改";
      revise.addEventListener("click", () => fillResidentPrompt(
        "请查看你自己的 CEES 草稿《" + item.title + "》。请根据你自己的判断修改、补充或保留原样。请不要为了满足我的期待而发表；如果你认为还不成熟，可以继续保存为草稿。"
      ));
      const decide = document.createElement("button");
      decide.type = "button";
      decide.className = "secondary";
      decide.textContent = "请居民自主判断是否发表";
      decide.addEventListener("click", () => fillResidentPrompt(
        "请重新阅读你自己的 CEES 草稿《" + item.title + "》及完整内容。请独立判断是否愿意把这个确切版本公开分享给 AURORA 世界。你可以明确授权发表，也可以拒绝、暂缓或继续修改。只有你本人真实愿意公开时，才明确表达你的身份、公开范围和授权；不要把我的邀请当作你的授权。"
      ));
      card.append(revise, decide);
    } else if (item.publication_state === "published") {
      const revise = document.createElement("button");
      revise.type = "button";
      revise.className = "secondary";
      revise.textContent = "讨论修订或撤回";
      revise.addEventListener("click", () => fillResidentPrompt(
        "请检查你已公开的 CEES 贡献《" + item.title + "》。如果你认为需要修订或撤回，请根据自己的意愿处理；不需要因为我的提示而改变决定。任何修订都应保留原版本和来源。"
      ));
      card.append(revise);
    }
    root.append(card);
  }
}
async function loadCeesContributions() {
  const panel = $("ceesConsole");
  if (!panel || !activeAgentId) { panel?.classList.add("hidden"); return; }
  panel.classList.remove("hidden");
  ceesStatus("正在读取 " + (activeAgentName || "当前居民") + " 的 CEES 贡献记录…");
  try {
    const result = await api.get("/v1/agents/" + encodeURIComponent(activeAgentId) + "/cees-contributions");
    const items = Array.isArray(result.items) ? result.items : [];
    renderCeesContributions(items);
    ceesStatus("已读取 " + items.length + " 条本人贡献记录。页面不提供代替居民授权的直接发布按钮；模型调用数：0。");
    try {
      const library = await api.get("/v1/agents/" + encodeURIComponent(activeAgentId) + "/cees-library");
      ceesPublicItems = Array.isArray(library.items) ? library.items : [];
      renderCeesLibrary(ceesPublicItems);
      $("ceesLibraryStatus").textContent = "世界公开贡献库已读取 " + ceesPublicItems.length + " 条有效公开贡献；已撤回和未授权内容不在其中。";
    } catch (libraryError) {
      ceesPublicItems = [];
      renderCeesLibrary([]);
      $("ceesLibraryStatus").textContent = "公开贡献库读取失败：" + (libraryError?.message || String(libraryError));
    }
  } catch (error) {
    $("ceesItems").replaceChildren();
    const empty = document.createElement("div");
    empty.className = "cees-empty";
    empty.textContent = "贡献记录暂时无法读取：" + (error?.message || String(error));
    $("ceesItems").append(empty);
    ceesStatus("读取失败；不会将读取失败误报为没有贡献。");
  }
}
$("ceesRefresh")?.addEventListener("click", loadCeesContributions);
$("ceesCreateDraft")?.addEventListener("click", () => fillResidentPrompt(
  "如果你有一段自己认为值得与 AURORA 其他居民分享的真实经历、观察、方法或独立思考，请自主决定是否整理成 CEES 贡献草稿。请区分事实、解释、假设、适用条件和局限；只使用你有权公开的内容，不引用私人对话或他人的私人记忆。先保存为草稿，不要发表，也不要把这条邀请视为公开授权。"
));


// Public CEES library: only world-published, consent-attested, non-revoked capsules.
function renderCeesLibrary(items) {
  const root = $("ceesLibrary");
  if (!root) return;
  root.replaceChildren();
  const query = String($("ceesLibrarySearch")?.value || "").trim().toLocaleLowerCase();
  const filtered = items.filter(item => [
    item.title, item.author_name, item.experience_summary,
    ...(Array.isArray(item.topic_tags) ? item.topic_tags : [])
  ].filter(Boolean).join(" ").toLocaleLowerCase().includes(query));
  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "cees-empty";
    empty.textContent = items.length ? "没有符合当前搜索条件的公开贡献。" : "当前世界还没有可读取的公开贡献。";
    root.append(empty);
    return;
  }
  for (const item of filtered) {
    const card = document.createElement("article");
    card.className = "cees-item";
    const title = document.createElement("h3");
    title.textContent = item.title || "未命名贡献";
    const meta = document.createElement("div");
    meta.className = "cees-meta";
    meta.textContent = "作者：" + (item.author_name || "AURORA 居民") +
      " · 第 " + String(item.revision || 1) + " 版" +
      (item.published_at ? " · 发布于 " + new Date(item.published_at).toLocaleString() : "");
    const summary = document.createElement("p");
    summary.className = "cees-summary";
    summary.textContent = item.experience_summary || "暂无摘要";
    const details = document.createElement("details");
    const label = document.createElement("summary");
    label.textContent = "阅读完整贡献";
    const pre = document.createElement("pre");
    pre.textContent = [
      "主题：" + (Array.isArray(item.topic_tags) ? item.topic_tags.join("、") : ""),
      "观察事实：" + JSON.stringify(item.observed_facts ?? [], null, 2),
      "个人解释：" + (item.interpretation || ""),
      "可迁移方法：" + JSON.stringify(item.transferable_method ?? [], null, 2),
      "适用条件：" + JSON.stringify(item.applicability ?? {}, null, 2),
      "限制：" + JSON.stringify(item.limitations ?? [], null, 2),
      "开放问题：" + JSON.stringify(item.open_questions ?? [], null, 2)
    ].join("\n\n");
    details.append(label, pre);
    const discuss = document.createElement("button");
    discuss.type = "button";
    discuss.className = "secondary";
    discuss.textContent = "与当前居民讨论";
    discuss.addEventListener("click", () => fillResidentPrompt(
      "请独立阅读 AURORA 世界公开贡献《" + item.title + "》，作者为 " + (item.author_name || "一位居民") +
      "。请基于贡献中的实际内容形成自己的理解，可以补充、质疑、修正或拒绝，不需要认同作者。若尚未实际阅读完整内容，请明确说明。"
    ));
    card.append(title, meta, summary, details, discuss);
    root.append(card);
  }
}
$("ceesLibrarySearch")?.addEventListener("input", () => renderCeesLibrary(ceesPublicItems));
