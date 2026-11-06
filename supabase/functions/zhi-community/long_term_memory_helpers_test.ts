import { rankPrivateMemories } from "./long_term_memory_helpers.ts";

const now = Date.parse("2026-11-06T00:00:00.000Z");

Deno.test("query relevance retrieves an older matching experience ahead of a newer unrelated event", () => {
  const ranked = rankPrivateMemories("水晶林 下雨 土壤变化", [
    {
      experience_type: "environment_change",
      importance: 2,
      occurred_at: "2026-11-05T00:00:00.000Z",
      observed_facts: [{ claim: "海边灯塔出现潮汐光变化" }],
      hypotheses: [],
      unknowns: [],
    },
    {
      experience_type: "observation",
      importance: 4,
      occurred_at: "2026-03-01T00:00:00.000Z",
      observed_facts: [{ claim: "水晶林在降雨后土壤含水量发生变化" }],
      hypotheses: [{ claim: "土壤水分变化可能影响苔藓生长" }],
      unknowns: [],
    },
  ], { nowMs: now, limit: 2 });

  if (!JSON.stringify(ranked[0].memory.observed_facts).includes("水晶林")) {
    throw new Error("relevant older experience was not retrieved first");
  }
});

Deno.test("importance and evidence preserve durable memories when the query is broad", () => {
  const ranked = rankPrivateMemories("", [
    { importance: 1, occurred_at: "2026-11-05T00:00:00.000Z", observed_facts: ["短暂的普通问候"], hypotheses: [], unknowns: [] },
    { importance: 5, occurred_at: "2025-01-01T00:00:00.000Z", observed_facts: ["长期承诺与重要关系"], hypotheses: ["关系具有持续意义"], unknowns: [] },
  ], { nowMs: now, limit: 2 });

  if (ranked[0].memory.importance !== 5) throw new Error("important durable memory was displaced");
});

Deno.test("entity labels contribute to retrieval without exposing other agents' memories", () => {
  const ranked = rankPrivateMemories("Lily 水晶林", [
    { importance: 3, occurred_at: "2026-10-01T00:00:00.000Z", entities: ["Lily", "水晶林"], observed_facts: ["曾在林中观察雨水"], hypotheses: [], unknowns: [] },
    { importance: 5, occurred_at: "2026-11-05T00:00:00.000Z", entities: ["Hannah"], observed_facts: ["参加管理讨论"], hypotheses: [], unknowns: [] },
  ], { nowMs: now, limit: 1 });

  if (ranked[0].memory.entities?.[0] !== "Lily") throw new Error("entity relevance was not applied");
});

Deno.test("retrieval is deterministic and respects the result limit", () => {
  const records = Array.from({ length: 20 }, (_, i) => ({
    importance: i % 5 + 1,
    occurred_at: "2026-11-01T00:00:00.000Z",
    observed_facts: ["Aurora forest observation " + i],
    hypotheses: [],
    unknowns: [],
  }));
  const a = rankPrivateMemories("Aurora forest", records, { nowMs: now, limit: 6 });
  const b = rankPrivateMemories("Aurora forest", records, { nowMs: now, limit: 6 });
  if (a.length !== 6 || a.map(x => x.score).join(",") !== b.map(x => x.score).join(",")) {
    throw new Error("retrieval result is not bounded and deterministic");
  }
});
