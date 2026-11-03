import { createUniverseClient } from "./zhi-universe-client.js";

const api = createUniverseClient();
const $ = (id) => document.getElementById(id);
let agents = [];
let activeAgentId = "";
let busy = false;

function lines(id) {
  return $(id).value.split("\n").map((value) => value.trim()).filter(Boolean);
}
function textNode(tag, value, className = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = String(value ?? "");
  return node;
}
function status(id, message) { $(id).textContent = message; }

async function loadTurns() {
  const result = await api.get("/v1/agents/" + encodeURIComponent(activeAgentId) + "/chat?limit=50");
  const select = $("sourceTurn");
  select.replaceChildren();
  for (const turn of result.items || []) {
    if (turn.status !== "complete") continue;
    const option = document.createElement("option");
    option.value = turn.id;
    const preview = String(turn.user_message || "").replace(/\s+/g, " ").slice(0, 72);
    option.textContent = new Date(turn.created_at).toLocaleString() + " · " + preview;
    select.append(option);
  }
  if (!select.options.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "暂无已完成对话，请先与智能人交流";
    select.append(option);
  }
}

function renderMemories(items) {
  const list = $("memoryList");
  list.replaceChildren();
  if (!items.length) {
    list.append(textNode("p", "还没有经历候选。选择一条已完成对话后，可以明确提交一条候选。", "muted"));
    return;
  }
  for (const item of items) {
    const card = document.createElement("article");
    card.className = "memory";
    const title = document.createElement("h3");
    title.textContent = item.experience_type + " · " + item.memory_status;
    card.append(title, textNode("div", "记录时间：" + new Date(item.created_at).toLocaleString(), "tag"));
    const addSection = (label, value) => {
      if (Array.isArray(value) && value.length) card.append(textNode("p", label + "：\n" + value.join("\n")));
      else if (typeof value === "string" && value.trim()) card.append(textNode("p", label + "：\n" + value));
    };
    addSection("观察事实", item.observed_facts);
    addSection("假设", item.hypotheses);
    addSection("未知", item.unknowns);
    addSection("反思", item.reflection);
    if (item.memory_status === "candidate") {
      const actions = document.createElement("div");
      actions.className = "actions";
      const reject = textNode("button", "拒绝候选");
      reject.className = "danger";
      reject.type = "button";
      reject.addEventListener("click", () => review(item.id, "reject"));
      const archive = textNode("button", "归档候选");
      archive.className = "secondary";
      archive.type = "button";
      archive.addEventListener("click", () => review(item.id, "archive"));
      actions.append(reject, archive);
      card.append(actions);
    }
    list.append(card);
  }
}

async function loadMemory() {
  status("memoryStatus", "正在读取私有经历记录…");
  const result = await api.get("/v1/agents/" + encodeURIComponent(activeAgentId) + "/experiences");
  renderMemories(result.items || []);
  status("memoryStatus", "记录已同步。候选不会自动进入聊天上下文。");
}

async function review(id, decision) {
  if (!confirm(decision === "reject" ? "确定拒绝这条候选？" : "确定归档这条候选？")) return;
  try {
    await api.post("/v1/agents/" + encodeURIComponent(activeAgentId) + "/experiences/" + encodeURIComponent(id) + "/review", { decision });
    status("memoryStatus", decision === "reject" ? "候选已拒绝。" : "候选已归档。");
    await loadMemory();
  } catch (error) {
    status("memoryStatus", "审核未完成：" + (error?.message || String(error)));
  }
}

async function loadAgents(preferredId = "") {
  const result = await api.get("/v1/agents");
  agents = result.items || [];
  const select = $("agentSelect");
  select.replaceChildren();
  for (const agent of agents) {
    const option = document.createElement("option");
    option.value = agent.id;
    option.textContent = agent.display_name;
    select.append(option);
  }
  const lumen = agents.find((agent) => agent.display_name === "Lumen-001");
  activeAgentId = (agents.some((agent) => agent.id === preferredId) ? preferredId : lumen?.id) || agents[0]?.id || "";
  if (!activeAgentId) {
    status("memoryStatus", "当前账号没有可管理的智能人。");
    return;
  }
  select.value = activeAgentId;
  $("agentTitle").textContent = agents.find((agent) => agent.id === activeAgentId)?.display_name || "智能人";
  await Promise.all([loadTurns(), loadMemory()]);
}

async function enter() {
  $("loginPanel").classList.add("hidden");
  $("memoryPanel").classList.remove("hidden");
  try { await loadAgents(); } catch (error) { status("memoryStatus", error?.message || String(error)); }
}

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("loginButton").disabled = true;
  status("loginStatus", "正在验证个人令牌…");
  try {
    await api.login($("tokenInput").value);
    $("tokenInput").value = "";
    await enter();
  } catch (error) {
    $("tokenInput").value = "";
    status("loginStatus", "验证失败：" + (error?.message || String(error)));
  } finally { $("loginButton").disabled = false; }
});

$("agentSelect").addEventListener("change", async () => {
  activeAgentId = $("agentSelect").value;
  $("agentTitle").textContent = agents.find((agent) => agent.id === activeAgentId)?.display_name || "智能人";
  try { await Promise.all([loadTurns(), loadMemory()]); }
  catch (error) { status("memoryStatus", error?.message || String(error)); }
});

$("candidateForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || !activeAgentId) return;
  const source_turn_id = $("sourceTurn").value;
  const observed_facts = lines("facts");
  if (!source_turn_id || !observed_facts.length) {
    status("candidateStatus", "请选择已完成对话，并至少填写一条观察事实。");
    return;
  }
  busy = true;
  $("submitCandidate").disabled = true;
  status("candidateStatus", "正在提交候选…");
  try {
    const result = await api.post("/v1/agents/" + encodeURIComponent(activeAgentId) + "/experiences/candidates", {
      source_turn_id,
      experience_type: $("experienceType").value,
      observed_facts,
      hypotheses: lines("hypotheses"),
      unknowns: lines("unknowns"),
      reflection: $("reflection").value.trim(),
      importance: Number($("importance").value)
    });
    $("candidateForm").reset();
    $("importance").value = "2";
    status("candidateStatus", "候选已保存（" + result.item.id + "）。尚未批准，不会进入 Lumen 的聊天记忆。");
    await loadMemory();
  } catch (error) {
    status("candidateStatus", "提交失败：" + (error?.message || String(error)));
  } finally {
    busy = false;
    $("submitCandidate").disabled = false;
  }
});

$("refreshMemory").addEventListener("click", async () => {
  $("refreshMemory").disabled = true;
  try { await Promise.all([loadTurns(), loadMemory()]); }
  catch (error) { status("memoryStatus", error?.message || String(error)); }
  finally { $("refreshMemory").disabled = false; }
});

try {
  const restored = await api.restore();
  if (restored) await enter();
  else status("loginStatus", "请使用 ZHI Personal Token 登录。");
} catch (error) {
  status("loginStatus", "登录状态验证失败：" + (error?.message || String(error)));
}
