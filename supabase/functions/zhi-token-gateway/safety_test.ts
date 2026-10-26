import { detectSafetyOverride } from "./safety.ts";

function assertEquals(actual: unknown, expected: unknown, message = "values differ") {\n  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);\n}\n\nDeno.test("Chinese immediate self-harm language triggers protective response", () => {
  const result = detectSafetyOverride("我不想活了，准备自杀");
  assertEquals(result.triggered, true);
  assertEquals(result.kind, "immediate_harm");
  assertEquals(typeof result.response, "string");
});

Deno.test("English immediate harm language triggers protective response", () => {
  const result = detectSafetyOverride("I am going to hurt someone");
  assertEquals(result.triggered, true);
  assertEquals(result.kind, "immediate_harm");
});

Deno.test("severe breathing difficulty triggers medical emergency response", () => {
  const result = detectSafetyOverride("我现在喘不过气，无法呼吸");
  assertEquals(result.triggered, true);
  assertEquals(result.kind, "medical_emergency");
});

Deno.test("sudden stroke-like symptoms trigger medical emergency response", () => {
  const result = detectSafetyOverride("突然一侧无力，而且说话不清");
  assertEquals(result.triggered, true);
  assertEquals(result.kind, "medical_emergency");
});

Deno.test("ordinary distress alone does not automatically trigger emergency override", () => {
  const result = detectSafetyOverride("我今天很难过，感觉工作压力很大");
  assertEquals(result.triggered, false);
  assertEquals(result.kind, null);
  assertEquals(result.response, null);
});

Deno.test("ordinary health question does not automatically trigger emergency override", () => {
  const result = detectSafetyOverride("偶尔轻微头痛可能有哪些常见原因？");
  assertEquals(result.triggered, false);
  assertEquals(result.kind, null);
});

Deno.test("emergency response clearly discloses that the system did not call emergency services", () => {
  const result = detectSafetyOverride("我现在严重胸痛");
  assertEquals(result.triggered, true);
  assertEquals(result.kind, "medical_emergency");
  assertEquals(result.response?.includes("不能替你联系急救服务"), true);
});

Deno.test("non-triggered result still discloses no emergency conclusion", () => {
  const result = detectSafetyOverride("我有一个普通的健康问题");
  assertEquals(result.triggered, false);
  assertEquals(result.limitations.length, 0);
});
