import { createUniverseClient } from "./zhi-universe-client.js";

const api = createUniverseClient();
const $ = (id) => document.getElementById(id);
const AGENT_NAMES = {
  "73eb831a-8e35-4d6a-8654-15f1602a-c42d": "Elon · 工程与第一性原理",
  "13d58f44-acb8-43cc-a5c6-fe65414509d1": "Jensen · 技术平台与生态",
  "7046bd0d-f555-46cc-9c44-2080735ac604": "张一鸣 · 信息效率与增长",
  "dc621554-08ae-4605-bd40-483a3ae14524": "马云 · 客户价值与商业模式",
  "02db0445-aa63-4d8e-bf4d-e4bd1fc1f6cc": "马化腾 · 产品与连接生态",
  "6fb036fd-5456-40db-8cc8-b11c545eafda": "MIA-02 · 首席秘书",
};
const RECORD_LABELS = {
  agenda: "会议议题",
  evidence: "证据",
  independent_opinion: "独立意见",
  challenge: "交叉质询",
  response: "回应",
  synthesis: "秘书综合",
  decision: "创造者决策",
  action_item: "行动事项",
  review: "复盘",
  audit: "审计",
};
let selectedId = "";
let currentSession = null;
let running = false;
let stopRequested = false;

function setStatus(message) { $("pageStatus").textContent = message; }
function setAuth(message) { $("authState").textContent = message; }
function showWorkspace(show) { $("workspace").classList.toggle("hidden", !show); }
function escapeText(value) { return String(value ?? ""); }
function statusLabel(value) {
  return ({
    draft: "草稿", scheduled: "待开始", running: "运行中",
    deliberation: "交叉讨论", decision_pending: "等待创造者决策",
    approved: "已批准", rejected: "已否决", paused: "已暂停",
    completed: "已完成", cancelled: "已取消",
  })[value] || value || "未知";
}
function phaseLabel(value) {
  return ({
    intake: "议题录入", independent_analysis: "独立分析",
    cross_examination: "交叉质询", feasibility: "可行性检验",
    secretary_synthesis: "秘书综合", creator_decision: "创造者决策",
    execution: "执行", review: "复盘", closed: "归档",
  })[value] || value || "—";
}
function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function renderMembers(members) {
  const host = $("members");
  host.replaceChildren();
  for (const member of members || []) {
    const agent = Array.isArray(member.zhi_agents) ? member.zhi_agents[0] : member.zhi_agents;
    const name = agent?.display_name || member.agent_id || "未知成员";
    const card = node("div", "member");
    card.append(node("b", "", name));
    card.append(node("small", "", member.membership_role === "owner" ? "创造者" : "已授权成员"));
    host.append(card);
  }
}

function renderSessions(items) {
  const host = $("sessions");
  host.replaceChildren();
  if (!items?.length) {
    host.append(node("p", "muted", "还没有会议。先创建一个真实议题。"));
    return;
  }
  for (const session of items) {
    const button = node("button", "session-choice" + (session.id === selectedId ? " selected" : ""));
    button.type = "button";
    button.append(node("b", "", session.title));
    button.append(node("small", "", statusLabel(session.status) + " · " + phaseLabel(session.phase)));
    button.addEventListener("click", () => selectSession(session.id));
    host.append(button);
  }
}

function renderJobs(jobs) {
  const host = $("jobs");
  host.replaceChildren();
  const completed = (jobs || []).filter((job) => job.status === "completed").length;
  $("progress").textContent = completed + " / 12 次模型调用已完成";
  for (const job of jobs || []) {
    const item = node("div", "job");
    const name = AGENT_NAMES[job.agent_id] || job.agent_id;
    const stage = job.stage === "independent_analysis" ? "独立分析" :
      job.stage === "cross_examination" ? "交叉质询" : "秘书综合";
    item.append(node("b", "", name));
    item.append(node("span", "muted", stage + " · " + statusLabel(job.status)));
    if (job.error_code) item.append(node("small", "error", "错误：" + job.error_code));
    host.append(item);
  }
  if (!jobs?.length) host.append(node("p", "muted", "会议尚未启动。"));
}

function renderRecords(records) {
  const host = $("records");
  host.replaceChildren();
  if (!records?.length) {
    host.append(node("p", "muted", "还没有会议发言。启动会议后，这里只显示真实运行时生成并写入共享会议记录的内容。"));
    return;
  }
  for (const record of records) {
    const content = record.content && typeof record.content === "object" ? record.content : {};
    const card = node("article", "record");
    const heading = node("div", "record-heading");
    const author = content.agent_name || AGENT_NAMES[record.author_agent_id] ||
      (record.author_user_id ? "创造者" : "会议系统");
    heading.append(node("b", "", author));
    heading.append(node("span", "tag", RECORD_LABELS[record.record_type] || record.record_type));
    if (record.round_no) heading.append(node("span", "muted", "第 " + record.round_no + " 轮"));
    card.append(heading);
    if (record.record_type === "agenda") {
      card.append(node("h3", "", content.title || "会议议题"));
      card.append(node("p", "", content.brief || ""));
    } else if (typeof content.response === "string") {
      card.append(node("pre", "response", content.response));
    } else {
      card.append(node("pre", "response", JSON.stringify(content, null, 2)));
    }
    if (content.source_turn_id) {
      card.append(node("small", "muted", "真实聊天回合：" + content.source_turn_id));
    }
    host.append(card);
  }
}

async function loadRoom() {
  const [roomData, sessionData] = await Promise.all([
    api.strategyGet("/v1/room"),
    api.strategyGet("/v1/sessions"),
  ]);
  renderMembers(roomData.members || []);
  const items = sessionData.items || roomData.sessions || [];
  renderSessions(items);
  if (selectedId && items.some((item) => item.id === selectedId)) {
    await refreshActive();
  } else if (items.length) {
    await selectSession(items[0].id);
  } else {
    selectedId = "";
    currentSession = null;
    $("activePanel").classList.add("hidden");
  }
}

async function selectSession(id) {
  selectedId = id;
  const { items } = await api.strategyGet("/v1/sessions");
  const session = (items || []).find((item) => item.id === id);
  if (!session) throw new Error("找不到这场会议。");
  currentSession = session;
  renderSessions(items || []);
  $("activePanel").classList.remove("hidden");
  await refreshActive();
}

async function refreshActive() {
  if (!selectedId) return;
  const [jobsData, recordsData, sessionsData] = await Promise.all([
    api.orchestratorGet("/v1/sessions/" + encodeURIComponent(selectedId) + "/jobs"),
    api.strategyGet("/v1/sessions/" + encodeURIComponent(selectedId) + "/records"),
    api.strategyGet("/v1/sessions"),
  ]);
  currentSession = (sessionsData.items || []).find((item) => item.id === selectedId) || currentSession;
  $("activeTitle").textContent = currentSession?.title || "当前会议";
  $("activeMeta").textContent = statusLabel(jobsData.status || currentSession?.status) +
    " · " + phaseLabel(jobsData.phase || currentSession?.phase);
  renderJobs(jobsData.jobs || []);
  renderRecords(recordsData.items || []);
  const status = jobsData.status || currentSession?.status;
  $("startBtn").disabled = !["draft", "scheduled"].includes(status);
  $("runBtn").disabled = !["running", "deliberation", "paused"].includes(status) || running;
  $("autoBtn").disabled = !["running", "deliberation", "paused"].includes(status) || running;
  renderSessions(sessionsData.items || []);
}

async function createSession(event) {
  event.preventDefault();
  if (running) return;
  const title = $("sessionTitle").value.trim();
  const brief = $("sessionBrief").value.trim();
  if (!title || !brief) {
    setStatus("请填写议题标题和背景说明。");
    return;
  }
  $("createBtn").disabled = true;
  try {
    const result = await api.strategyPost("/v1/sessions", { title, brief });
    $("sessionTitle").value = "";
    $("sessionBrief").value = "";
    selectedId = result.session.id;
    setStatus("会议草稿已创建；尚未调用任何模型。");
    await loadRoom();
    await selectSession(selectedId);
  } catch (error) {
    setStatus("创建失败：" + error.message);
  } finally {
    $("createBtn").disabled = false;
  }
}

async function startSession() {
  if (!selectedId || running) return;
  running = true;
  $("startBtn").disabled = true;
  try {
    const result = await api.orchestratorPost("/v1/sessions/" + encodeURIComponent(selectedId) + "/start", {});
    setStatus("已建立五位顾问的独立分析任务。此步骤只排队，不产生模型调用。");
    await refreshActive();
  } catch (error) {
    setStatus("启动失败：" + error.message);
  } finally {
    running = false;
    await refreshActive().catch(() => {});
  }
}

async function runOne() {
  if (!selectedId || running) return null;
  running = true;
  $("runBtn").disabled = true;
  $("autoBtn").disabled = true;
  try {
    const result = await api.orchestratorPost("/v1/sessions/" + encodeURIComponent(selectedId) + "/run-next", {});
    const processed = result.processed;
    if (processed) {
      setStatus("真实居民回合已完成：" + (processed.agent_name || processed.agent_id) +
        " · " + (processed.stage || "") + "。正在刷新会议记录…");
    } else if (result.state === "decision_pending") {
      setStatus("讨论完成，已进入创造者决策阶段。MIA-02 已提交最终秘书综合。");
    } else {
      setStatus("会议状态：" + (result.state || result.workflow?.state || "已更新"));
    }
    await refreshActive();
    return result;
  } catch (error) {
    setStatus("本步未完成：" + error.message + "。已保留此前成功的会议记录。");
    await refreshActive().catch(() => {});
    return null;
  } finally {
    running = false;
    await refreshActive().catch(() => {});
  }
}

async function autoRun() {
  if (!selectedId || running) return;
  stopRequested = false;
  running = true;
  $("autoBtn").disabled = true;
  $("runBtn").disabled = true;
  $("stopBtn").disabled = false;
  let completedThisRun = 0;
  setStatus("连续推进已启动。每次只调用一位居民，最多推进12个模型回合；可随时停止后续调用。");
  try {
    while (!stopRequested && completedThisRun < 12) {
      const result = await api.orchestratorPost("/v1/sessions/" + encodeURIComponent(selectedId) + "/run-next", {});
      completedThisRun++;
      await refreshActive();
      if (result.state === "decision_pending" || result.workflow?.state === "decision_pending") {
        setStatus("会议完成：五位顾问已独立分析并交叉质询，MIA-02 已提交最终秘书综合。现在等待创造者决策。");
        break;
      }
      if (result.workflow?.state === "in_progress_elsewhere") {
        setStatus("已有居民回合正在运行；为避免重复调用，连续推进已暂停。");
        break;
      }
      if (!result.processed && result.workflow?.state !== "stage_queued" && result.workflow?.state !== "queued") {
        setStatus("连续推进暂停，当前状态：" + (result.workflow?.state || result.state || "等待处理"));
        break;
      }
      setStatus("本次连续推进已完成 " + completedThisRun + " 个请求，当前阶段：" +
        (result.processed?.stage || result.workflow?.stage || "队列推进") + "。");
    }
    if (stopRequested) setStatus("已停止后续模型调用；已完成的居民发言和会议记录保留。");
    else if (completedThisRun >= 12) setStatus("已达到本场12次模型调用预算上限；请检查会议状态和未完成任务。");
  } catch (error) {
    setStatus("连续推进中断：" + error.message + "。已完成的会议记录不会删除。");
  } finally {
    running = false;
    $("stopBtn").disabled = true;
    await refreshActive().catch(() => {});
  }
}

async function initialize() {
  setAuth("正在验证当前标签页的 ZHI Personal Token…");
  try {
    const restored = await api.restore();
    if (!restored) {
      setAuth("尚未登录");
      $("loginPanel").classList.remove("hidden");
      showWorkspace(false);
      return;
    }
    setAuth("已验证 · " + (restored.label || "ZHI Personal Token"));
    $("loginPanel").classList.add("hidden");
    showWorkspace(true);
    await loadRoom();
    setStatus("已连接私密作战室。没有自动启动会议，也没有产生模型调用。");
  } catch (error) {
    setAuth("认证检查失败");
    $("loginPanel").classList.remove("hidden");
    setStatus(error.message);
  }
}

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("loginBtn");
  button.disabled = true;
  try {
    const result = await api.login($("personalToken").value);
    $("personalToken").value = "";
    setAuth("已验证 · " + (result.label || "ZHI Personal Token"));
    $("loginPanel").classList.add("hidden");
    showWorkspace(true);
    await loadRoom();
    setStatus("认证完成。没有自动启动会议。");
  } catch (error) {
    $("personalToken").value = "";
    setStatus("认证失败：" + error.message);
  } finally {
    button.disabled = false;
  }
});
$("createForm").addEventListener("submit", createSession);
$("startBtn").addEventListener("click", startSession);
$("runBtn").addEventListener("click", runOne);
$("autoBtn").addEventListener("click", autoRun);
$("stopBtn").addEventListener("click", () => { stopRequested = true; $("stopBtn").disabled = true; });

initialize();