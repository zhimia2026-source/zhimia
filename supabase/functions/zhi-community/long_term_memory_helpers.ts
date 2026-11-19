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
    affective_relevance: number;
    topology_relevance: number;
  };
  related_memory_ids: string[];
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
  options: { limit?: number; nowMs?: number; affectState?: unknown } = {},
): RankedPrivateMemory<T>[] {
  const limit = Math.max(1, Math.min(24, Math.trunc(options.limit ?? 12)));
  const nowMs = options.nowMs ?? Date.now();
  const queryTokens = tokens(query);
  const querySet = new Set(queryTokens);

  // Build a deterministic, one-hop associative topology from this resident's
  // already-authorized memories. Edges mean content similarity only, never
  // causation, shared experience, or a verified emotional link.
  const memoryTokenSets = memories.map((memory) => new Set(tokens(memoryText(memory))));
  const memoryEntitySets = memories.map((memory) => {
    const metadata = memory.metadata && typeof memory.metadata === "object" && !Array.isArray(memory.metadata)
      ? memory.metadata as Record<string, unknown> : {};
    const raw = Array.isArray(memory.entities) ? memory.entities
      : Array.isArray(metadata.entities) ? metadata.entities : [];
    return new Set(raw.filter((item): item is string => typeof item === "string").flatMap(tokens));
  });
  const directRelevance = memories.map((memory, index) => {
    const mt = memoryTokenSets[index];
    const lexical = queryTokens.length
      ? queryTokens.filter((token) => mt.has(token)).length / queryTokens.length : 0;
    const et = memoryEntitySets[index];
    const entity = queryTokens.length && et.size
      ? queryTokens.filter((token) => et.has(token)).length / queryTokens.length : 0;
    return clamp(Math.max(lexical, entity));
  });
  const topology = memories.map((memory, index) => {
    const related: Array<{ id: string; weight: number }> = [];
    let propagated = 0;
    if (queryTokens.length) {
      for (let other = 0; other < memories.length; other++) {
        if (other === index || directRelevance[other] <= 0) continue;
        const a = memoryTokenSets[index], b = memoryTokenSets[other];
        let shared = 0;
        for (const token of a) if (b.has(token)) shared++;
        let sharedEntities = 0;
        for (const token of memoryEntitySets[index]) if (memoryEntitySets[other].has(token)) sharedEntities++;
        if (shared < 2 && sharedEntities === 0) continue;
        const overlap = shared / Math.max(1, Math.min(a.size, b.size));
        const edgeWeight = clamp(overlap * 0.65 + (sharedEntities > 0 ? 0.35 : 0));
        propagated = Math.max(propagated, directRelevance[other] * edgeWeight * 0.65);
        const relatedId = memories[other].id;
        if (typeof relatedId === "string" && relatedId.length > 0) {
          related.push({ id: relatedId, weight: edgeWeight });
        }
      }
    }
    related.sort((a, b) => b.weight - a.weight);
    return {
      relevance: clamp(propagated),
      relatedMemoryIds: related.slice(0, 3).map((item) => item.id),
    };
  });

  const ranked = memories.map((memory, index) => {
    const text = memoryText(memory);
    const docTokens = new Set(tokens(text));
    const matched = queryTokens.filter((token) => docTokens.has(token)).length;
    const lexical = queryTokens.length ? clamp(matched / queryTokens.length) : 0;

    const rawEntities = Array.isArray(memory.entities)
      ? memory.entities.filter((item): item is string => typeof item === "string")
      : Array.isArray((memory.metadata as Record<string, unknown> | null)?.entities)
        ? ((memory.metadata as Record<string, unknown>).entities as unknown[]).filter((item): item is string => typeof item === "string")
        : [];
    const entityTokens = memoryEntitySets[index];
    const entity = queryTokens.length && entityTokens.size
      ? clamp(queryTokens.filter((token) => entityTokens.has(token)).length / queryTokens.length)
      : 0;

    const importance = clamp((typeof memory.importance === "number" ? memory.importance : 1) / 5);
    const facts = asText(memory.observed_facts).length;
    const hypotheses = asText(memory.hypotheses).length;
    const unknowns = asText(memory.unknowns).length;
    const evidence = clamp((facts + hypotheses * 0.35) / Math.max(1, facts + hypotheses + unknowns));
    const recency = Math.exp(-daysOld(memory.occurred_at, nowMs) / 365);

    // Arousal changes temporal salience only when the resident has a measured,
    // confidence-bearing core_axes.arousal value. Higher arousal modestly favors
    // recent lived memories; lower arousal preserves more weight for lexical match.
    // No memory content, labels, or experiences are generated or rewritten.
    const affectRoot = options.affectState && typeof options.affectState === "object" &&
      !Array.isArray(options.affectState) ? options.affectState as Record<string, unknown> : {};
    const affectDimensions = affectRoot.dimensions && typeof affectRoot.dimensions === "object" &&
      !Array.isArray(affectRoot.dimensions) ? affectRoot.dimensions as Record<string, unknown> : {};
    const coreAxes = affectDimensions.core_axes && typeof affectDimensions.core_axes === "object" &&
      !Array.isArray(affectDimensions.core_axes) ? affectDimensions.core_axes as Record<string, unknown> : {};
    const arousalItem = coreAxes.arousal && typeof coreAxes.arousal === "object" &&
      !Array.isArray(coreAxes.arousal) ? coreAxes.arousal as Record<string, unknown> : null;
    const arousal = arousalItem && typeof arousalItem.value === "number" &&
      Number.isFinite(arousalItem.value) && typeof arousalItem.confidence === "number" &&
      arousalItem.confidence >= 0.55 && arousalItem.evidence_kind !== "unknown"
      ? clamp(arousalItem.value)
      : null;
    // Emotion intensity contributes modestly to temporal salience: a current,
    // evidence-backed emotional response can make recent personal memories easier
    // to retrieve. It does not rewrite memory content or label old memories.
    const emotionGroup = affectDimensions.seven_emotions && typeof affectDimensions.seven_emotions === "object" &&
      !Array.isArray(affectDimensions.seven_emotions)
      ? affectDimensions.seven_emotions as Record<string, unknown> : {};
    const emotionKeys = ["joy", "anger", "worry", "pensiveness", "grief", "fear", "surprise"];
    const emotionSalience = emotionKeys.reduce((max, key) => {
      const item = emotionGroup[key] && typeof emotionGroup[key] === "object" &&
        !Array.isArray(emotionGroup[key]) ? emotionGroup[key] as Record<string, unknown> : {};
      if (typeof item.value !== "number" || !Number.isFinite(item.value) ||
          typeof item.confidence !== "number" || item.confidence < 0.55 ||
          item.evidence_kind !== "inferred") return max;
      return Math.max(max, clamp(item.value) * item.confidence);
    }, 0);
    const arousalSignal = arousal === null ? 0 : (arousal - 0.5) * 0.08;
    const affectiveRelevance = Math.max(-0.04, Math.min(0.04, arousalSignal + emotionSalience * 0.04));

    // Transfer at most 0.04 weight between recency and query matching / durable
    // importance. Total score weight remains 1.0 at both boundaries.
    const topologyRelevance = topology[index].relevance;
    const topologyWeight = queryTokens.length ? 0.06 : 0;
    const lexicalWeight = 0.48 - affectiveRelevance * 0.75 - topologyWeight;
    const entityWeight = 0.12 - affectiveRelevance * 0.25;
    const recencyWeight = 0.10 + affectiveRelevance;
    const score = queryTokens.length
      ? lexicalWeight * lexical + entityWeight * entity + topologyWeight * topologyRelevance +
        0.18 * importance + 0.12 * evidence + recencyWeight * recency
      : (0.50 - affectiveRelevance) * importance + 0.30 * evidence + (0.20 + affectiveRelevance) * recency;

    return {
      memory,
      score,
      signals: {
        lexical, entity, importance, evidence, recency,
        affective_relevance: affectiveRelevance,
        topology_relevance: topologyRelevance,
      },
      related_memory_ids: topology[index].relatedMemoryIds,
      _queryMatched: querySet.size === 0 || matched > 0 || entity > 0 || topologyRelevance > 0.04,
    };
  });

  ranked.sort((a, b) =>
    Number(b._queryMatched) - Number(a._queryMatched) ||
    b.score - a.score ||
    String(b.memory.occurred_at ?? "").localeCompare(String(a.memory.occurred_at ?? ""))
  );
  return ranked.slice(0, limit).map(({ _queryMatched: _ignored, ...item }) => item);
}
