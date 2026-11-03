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
