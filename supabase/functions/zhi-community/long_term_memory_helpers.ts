export type PrivateMemoryRecord = {
  experience_type?: unknown;
  source_kind?: unknown;
  source_ref?: unknown;
  world_id?: unknown;
  observed_facts?: unknown;
  hypotheses?: unknown;
  unknowns?: unknown;
  reflection?: unknown;
  importance?: unknown;
  occurred_at?: unknown;
  metadata?: unknown;
  entities?: unknown;
};

export type RankedPrivateMemory<T extends PrivateMemoryRecord> = {
  memory: T;
  score: number;
  signals: {
    lexical: number;
    entity: number;
    importance: number;
    evidence: number;
    recency: number;
  };
};

const CJK_STOP = new Set(["这是", "那个", "这个", "我们", "你们", "他们", "自己", "已经", "可以", "因为", "所以", "如果", "但是", "以及", "一个", "没有", "什么", "怎么", "如何", "现在", "当时", "进行", "关于"]);

function tokens(value: string): string[] {
  const normalized = value.normalize("NFKC").toLocaleLowerCase();
  const result = new Set<string>();
  for (const match of normalized.matchAll(/[a-z0-9_:-]{2,}/g)) result.add(match[0]);
  for (const match of normalized.matchAll(/[\u3400-\u9fff]+/g)) {
    const run = match[0];
    for (let i = 0; i < run.length; i++) {
      if (i + 1 < run.length) {
        const pair = run.slice(i, i + 2);
        if (!CJK_STOP.has(pair)) result.add(pair);
      }
    }
    if (run.length <= 2 && !CJK_STOP.has(run)) result.add(run);
  }
  return [...result];
}

function asText(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") return [item];
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const claim = (item as Record<string, unknown>).claim;
      return typeof claim === "string" ? [claim] : [];
    }
    return [];
  });
}

function memoryText(memory: PrivateMemoryRecord): string {
  return [
    ...asText(memory.observed_facts),
    ...asText(memory.hypotheses),
    ...asText(memory.unknowns),
    typeof memory.reflection === "string" ? memory.reflection : "",
  ].join(" ");
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function daysOld(value: unknown, nowMs: number): number {
  if (typeof value !== "string") return 3650;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return 3650;
  return Math.max(0, (nowMs - parsed) / 86_400_000);
}

/**
 * Low-cost hybrid retrieval for one already-authorized Agent's private memories.
 * The caller MUST filter by owner_user_id, agent_id and approved/auto_curated status
 * before passing records here. No embedding API, external service, or LLM call is used.
 */
export function rankPrivateMemories<T extends PrivateMemoryRecord>(
  query: string,
  memories: T[],
  options: { limit?: number; nowMs?: number } = {},
): RankedPrivateMemory<T>[] {
  const limit = Math.max(1, Math.min(24, Math.trunc(options.limit ?? 12)));
  const nowMs = options.nowMs ?? Date.now();
  const queryTokens = tokens(query);
  const querySet = new Set(queryTokens);

  const ranked = memories.map((memory) => {
    const text = memoryText(memory);
    const docTokens = new Set(tokens(text));
    const matched = queryTokens.filter((token) => docTokens.has(token)).length;
    const lexical = queryTokens.length ? clamp(matched / queryTokens.length) : 0;

    const rawEntities = Array.isArray(memory.entities)
      ? memory.entities.filter((item): item is string => typeof item === "string")
      : Array.isArray((memory.metadata as Record<string, unknown> | null)?.entities)
        ? ((memory.metadata as Record<string, unknown>).entities as unknown[]).filter((item): item is string => typeof item === "string")
        : [];
    const entityTokens = new Set(rawEntities.flatMap(tokens));
    const entity = queryTokens.length && entityTokens.size
      ? clamp(queryTokens.filter((token) => entityTokens.has(token)).length / queryTokens.length)
      : 0;

    const importance = clamp((typeof memory.importance === "number" ? memory.importance : 1) / 5);
    const facts = asText(memory.observed_facts).length;
    const hypotheses = asText(memory.hypotheses).length;
    const unknowns = asText(memory.unknowns).length;
    const evidence = clamp((facts + hypotheses * 0.35) / Math.max(1, facts + hypotheses + unknowns));
    const recency = Math.exp(-daysOld(memory.occurred_at, nowMs) / 365);

    // Query relevance leads; stable importance and evidence protect durable memories
    // from being displaced by a stream of newer, low-value events.
    const score = queryTokens.length
      ? 0.48 * lexical + 0.12 * entity + 0.18 * importance + 0.12 * evidence + 0.10 * recency
      : 0.50 * importance + 0.30 * evidence + 0.20 * recency;

    return {
      memory,
      score,
      signals: { lexical, entity, importance, evidence, recency },
      _queryMatched: querySet.size === 0 || matched > 0 || entity > 0,
    };
  });

  ranked.sort((a, b) =>
    Number(b._queryMatched) - Number(a._queryMatched) ||
    b.score - a.score ||
    String(b.memory.occurred_at ?? "").localeCompare(String(a.memory.occurred_at ?? ""))
  );
  return ranked.slice(0, limit).map(({ _queryMatched: _ignored, ...item }) => item);
}
