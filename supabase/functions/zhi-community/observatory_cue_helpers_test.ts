import { assertEquals } from "jsr:@std/assert";
import { resolveCueTransition } from "./observatory_cue_helpers.ts";

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
