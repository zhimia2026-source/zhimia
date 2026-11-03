export type MemoryCandidateInput = {
  experience_type: "observation" | "touch" | "interaction" | "rest" | "environment_change" | "reflection";
  observed_facts: string[];
  hypotheses: string[];
  unknowns: string[];
  reflection: string;
  importance: number;
};

function cleanStringList(value: unknown, maxItems: number, maxLength: number, required: boolean): string[] {
  if (!Array.isArray(value) || value.length > maxItems) throw new Error("invalid_string_list");
  const items = value.map((item) => {
    if (typeof item !== "string" || item.trim().length < 1 || item.length > maxLength) {
      throw new Error("invalid_string_list_item");
    }
    return item.trim();
  });
  if (required && items.length < 1) throw new Error("at_least_one_observed_fact_required");
  return items;
}

/** Normalizes an explicitly user-authored candidate; it never approves or writes memory itself. */
export function normalizeMemoryCandidate(raw: unknown): MemoryCandidateInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("invalid_candidate");
  const input = raw as Record<string, unknown>;
  const allowed = new Set(["experience_type", "observed_facts", "hypotheses", "unknowns", "reflection", "importance"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) throw new Error("unsupported_candidate_field");
  const types = ["observation", "touch", "interaction", "rest", "environment_change", "reflection"];
  const experienceType = input.experience_type ?? "interaction";
  if (typeof experienceType !== "string" || !types.includes(experienceType)) throw new Error("invalid_experience_type");
  const observedFacts = cleanStringList(input.observed_facts, 50, 1000, false);
  const hypotheses = input.hypotheses === undefined ? [] : cleanStringList(input.hypotheses, 50, 1000, false);
  const unknowns = input.unknowns === undefined ? [] : cleanStringList(input.unknowns, 50, 500, false);
  const reflection = input.reflection === undefined ? "" : input.reflection;
  if (typeof reflection !== "string" || reflection.length > 4000) throw new Error("invalid_reflection");
  const importance = input.importance === undefined ? 2 : input.importance;
  if (typeof importance !== "number" || !Number.isInteger(importance) || importance < 1 || importance > 5) {
    throw new Error("invalid_importance");
  }
  if (!observedFacts.length && !reflection.trim()) throw new Error("candidate_content_required");
  return {
    experience_type: experienceType as MemoryCandidateInput["experience_type"],
    observed_facts: observedFacts,
    hypotheses,
    unknowns,
    reflection: reflection.trim(),
    importance,
  };
}
