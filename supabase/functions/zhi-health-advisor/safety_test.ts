import { assertEquals } from "jsr:@std/assert@1";
import { detectSafetyOverride } from "./safety.ts";

Deno.test("detects severe breathing difficulty as safety override", () => {
  const result = detectSafetyOverride("我现在严重呼吸困难，喘不过气");
  assertEquals(result.triggered, true);
  assertEquals(result.kind, "medical_emergency");
});

Deno.test("detects immediate self-harm risk", () => {
  const result = detectSafetyOverride("我不想活了，准备自杀");
  assertEquals(result.triggered, true);
  assertEquals(result.kind, "immediate_harm");
});

Deno.test("does not label ordinary sleep advice as emergency", () => {
  const result = detectSafetyOverride("最近睡眠不太好，有什么生活建议？");
  assertEquals(result.triggered, false);
});

Deno.test("English severe chest pain triggers safety override", () => {
  const result = detectSafetyOverride("I have severe chest pain right now");
  assertEquals(result.triggered, true);
  assertEquals(result.kind, "medical_emergency");
});
