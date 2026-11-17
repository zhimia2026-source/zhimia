import { assertEquals } from "jsr:@std/assert";
import { extractObservatoryCueAction, resolveCueTransition } from "./observatory_cue_helpers.ts";

Deno.test("residents may choose to explore, defer, dismiss, or complete cues", () => {
  const now = Date.parse("2026-11-17T12:00:00.000Z");
  assertEquals(resolveCueTransition("explore", "available", now)?.update?.status, "exploring");
  assertEquals(resolveCueTransition("defer", "available", now)?.update?.not_before, "2026-11-18T12:00:00.000Z");
  assertEquals(resolveCueTransition("dismiss", "available", now)?.update?.status, "dismissed");
  assertEquals(resolveCueTransition("complete", "exploring", now)?.update?.status, "completed");
});

Deno.test("invalid cue transitions do not overwrite resident decisions", () => {
  const now = Date.parse("2026-11-17T12:00:00.000Z");
  assertEquals(resolveCueTransition("complete", "available", now), null);
  assertEquals(resolveCueTransition("dismiss", "completed", now), null);
  assertEquals(resolveCueTransition("explore", "dismissed", now), null);
});

Deno.test("replaying explore and completion is idempotent", () => {
  const now = Date.parse("2026-11-17T12:00:00.000Z");
  assertEquals(resolveCueTransition("explore", "exploring", now)?.idempotent, true);
  assertEquals(resolveCueTransition("complete", "completed", now)?.idempotent, true);
});

Deno.test("resident cue marker is accepted only for a surfaced cue and removed from chat text", () => {
  const cueId = "11111111-1111-4111-8111-111111111111";
  const extracted = extractObservatoryCueAction(
    "我想继续追踪这次变化。<ZHI_OBSERVATORY_CUE>{\"cue_id\":\"11111111-1111-4111-8111-111111111111\",\"action\":\"explore\"}</ZHI_OBSERVATORY_CUE>",
    [{ id: cueId, status: "available" }],
  );
  assertEquals(extracted.reply, "我想继续追踪这次变化。");
  assertEquals(extracted.action?.action, "explore");
  assertEquals(extracted.rejected, false);
});

Deno.test("resident cue marker rejects unknown cues and multiple actions", () => {
  const unknown = extractObservatoryCueAction(
    '<ZHI_OBSERVATORY_CUE>{"cue_id":"11111111-1111-4111-8111-111111111111","action":"explore"}</ZHI_OBSERVATORY_CUE>',
    [],
  );
  assertEquals(unknown.action, null);
  assertEquals(unknown.rejected, true);
  const multiple = extractObservatoryCueAction(
    '<ZHI_OBSERVATORY_CUE>{"cue_id":"11111111-1111-4111-8111-111111111111","action":"explore"}</ZHI_OBSERVATORY_CUE><ZHI_OBSERVATORY_CUE>{"cue_id":"11111111-1111-4111-8111-111111111111","action":"dismiss"}</ZHI_OBSERVATORY_CUE>',
    [{ id: "11111111-1111-4111-8111-111111111111", status: "available" }],
  );
  assertEquals(multiple.action, null);
  assertEquals(multiple.rejected, true);
});
