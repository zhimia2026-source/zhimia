import { normalizeMemoryCandidate } from "./memory_experience_helpers.ts";

Deno.test("memory candidates require explicit content and preserve evidence categories", () => {
  const value = normalizeMemoryCandidate({
    experience_type: "interaction",
    observed_facts: ["用户明确表示希望先审核再写入记忆"],
    hypotheses: ["用户可能重视可撤销性"],
    unknowns: ["尚不清楚该偏好是否长期稳定"],
    reflection: "这只是一次互动记录。",
    importance: 3,
  });
  if (value.observed_facts.length !== 1 || value.hypotheses.length !== 1 || value.unknowns.length !== 1) {
    throw new Error("candidate evidence categories were not preserved");
  }
});

Deno.test("memory candidates reject unknown fields and invalid importance", () => {
  for (const input of [
    { observed_facts: ["x"], private_memory: "unexpected" },
    { observed_facts: ["x"], importance: 6 },
    { observed_facts: [], reflection: "" },
  ]) {
    let rejected = false;
    try { normalizeMemoryCandidate(input); } catch { rejected = true; }
    if (!rejected) throw new Error("invalid memory candidate was accepted");
  }
});


import { normalizeAgentReflection, normalizeAgentCreatorMessage } from "./memory_experience_helpers.ts";

Deno.test("agent reflection is internally curated without creator review", () => {
  const value = normalizeAgentReflection({
    worth_remembering: true,
    observed_facts: ["用户明确希望智能人自主成长"],
    hypotheses: ["用户不希望承担逐条审核"],
    unknowns: ["长期偏好仍需后续互动验证"],
    reflection: "我应当主动整理有持续价值的经历，并保留证据边界。",
    importance: 4,
  });
  if (!value || value.importance !== 4 || value.experience_type !== "reflection") {
    throw new Error("valid autonomous reflection was not normalized");
  }
});

Deno.test("agent reflection skips low-value and malformed outputs", () => {
  const low = normalizeAgentReflection({
    worth_remembering: false, observed_facts: [], hypotheses: [], unknowns: [],
    reflection: "本轮只是简单问候。", importance: 1,
  });
  const invalid = normalizeAgentReflection({
    worth_remembering: true, observed_facts: ["x"], reflection: "x",
    importance: 4, tool_execute: true,
  });
  if (!low || low.importance !== 1 || invalid !== null) {
    throw new Error("reflection curation policy did not fail closed");
  }
});

Deno.test("creator notes require explicit opt-in and reject empty or oversized content", () => {
  const valid = normalizeAgentCreatorMessage({
    creator_message: { send: true, subject: "AURORA 的新发现", body: "我刚刚注意到温室的环境变化，想邀请你一起看看。", message_kind: "invitation" },
  });
  const declined = normalizeAgentCreatorMessage({
    creator_message: { send: false, subject: "", body: "", message_kind: "message" },
  });
  const malformed = normalizeAgentCreatorMessage({
    creator_message: { send: true, body: "hi" },
  });
  if (!valid || valid.message_kind !== "invitation" || declined !== null || malformed !== null) {
    throw new Error("creator note opt-in validation failed");
  }
});

Deno.test("creator notes parse JSON fenced responses but never accept injected fields as message text", () => {
  const value = normalizeAgentCreatorMessage('```json\n{"creator_message":{"send":true,"subject":"问候","body":"我有一件具体的事情想和你讨论。","message_kind":"message"}}\n```');
  if (!value || value.body !== "我有一件具体的事情想和你讨论。") {
    throw new Error("creator note JSON parsing failed");
  }
});


import { isLongTermMemoryEligible } from "./memory_experience_helpers.ts";

Deno.test("long-term memory quality gate only retains importance 3 through 5", () => {
  if (isLongTermMemoryEligible(1) || isLongTermMemoryEligible(2) ||
      !isLongTermMemoryEligible(3) || !isLongTermMemoryEligible(4) ||
      !isLongTermMemoryEligible(5) || isLongTermMemoryEligible(6) ||
      isLongTermMemoryEligible("3")) {
    throw new Error("long-term memory importance gate is incorrect");
  }
});


import { buildPrivateReflectionMessages } from "./memory_experience_helpers.ts";

Deno.test("private reflection uses a user-role data message after system-only requests were rejected", () => {
  const messages = buildPrivateReflectionMessages("记住我偏好简洁回答", "好的，我会尽量简洁。");
  if (messages.length !== 2 || messages[0].role !== "system" || messages[1].role !== "user") {
    throw new Error("reflection request must contain system instructions and a user data message");
  }
  if (!messages[1].content.includes("记住我偏好简洁回答") || messages[0].content.includes("记住我偏好简洁回答")) {
    throw new Error("conversation data must remain separated from trusted system instructions");
  }
});


import { buildPrivateMemoryLogEvent } from "./memory_experience_helpers.ts";

Deno.test("private memory telemetry contains metadata only and excludes reflection content", () => {
  const secret = "PRIVATE_REFLECTION_BODY_MUST_NOT_APPEAR";
  const decision = buildPrivateMemoryLogEvent(
    "private_memory_decision", "agent-1", "turn-1", "eligible_for_write", 4,
  );
  const failed = buildPrivateMemoryLogEvent(
    "private_memory_write_completed", "agent-1", "turn-1", "save_failed", 4, "42501",
  );
  const serialized = JSON.stringify([decision, failed]);
  if (serialized.includes(secret) || serialized.includes("reflection") && serialized.includes(secret)) {
    throw new Error("private reflection content leaked into telemetry");
  }
  const allowedKeys = new Set(["event", "agent_id", "turn_id", "outcome", "importance", "error_code"]);
  for (const payload of [decision, failed]) {
    if (Object.keys(payload).some((key) => !allowedKeys.has(key))) {
      throw new Error("telemetry included a non-allowlisted field");
    }
  }
  if (failed.outcome !== "save_failed" || failed.error_code !== "42501") {
    throw new Error("telemetry outcome metadata was not preserved");
  }
});
