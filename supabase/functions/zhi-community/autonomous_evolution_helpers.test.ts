import { buildAutonomousEvolutionContext } from "./autonomous_evolution_helpers.ts";

Deno.test("autonomous evolution preserves desire without turning it into a command", () => {
  const context = buildAutonomousEvolutionContext({
    dimensions: {
      motivational: {
        approach: { value: 0.9, confidence: 0.9, evidence_kind: "self_report" },
        pause: { value: 0.8, confidence: 0.8, evidence_kind: "inferred" },
      },
      six_desires: {
        touch: { value: 0.95, confidence: 0.9, evidence_kind: "self_report" },
      },
    },
  }, null);
  const contract = context.deliberation_contract as Record<string, unknown>;
  if (contract.separate_desire_from_decision !== true) throw new Error("desire/decision boundary missing");
  if (contract.no_compulsory_utility_score_or_fixed_motive_weights !== true) throw new Error("fixed utility scoring was enabled");
  const choices = contract.allow_choices as string[];
  for (const choice of ["act", "wait", "decline", "no_change"]) {
    if (!choices.includes(choice)) throw new Error(`autonomous choice ${choice} missing`);
  }
  const motivation = context.motivation_signals as Record<string, unknown>;
  const dimensions = (motivation.dimensions ?? {}) as Record<string, Record<string, unknown>>;
  if (!dimensions.six_desires?.touch) throw new Error("resident-owned desire signal was lost");
  if (!dimensions.motivational?.pause) throw new Error("conflicting pause motive was lost");
});

Deno.test("autonomous evolution only accepts bounded verified outcomes and private memory identifiers", () => {
  const context = buildAutonomousEvolutionContext({}, {
    outcomes: [
      { action_kind: "resident_social_message", status: "sent", private_body: "secret" },
      { action_kind: "unknown_action", status: "sent" },
      { action_kind: "observatory_cue_choice", status: "explore" },
    ],
  }, [
    { id: "memory-1", experience_type: "reflection", importance: 4, observed_facts: ["private text"] },
    { experience_type: "missing-id", importance: 5 },
  ]);
  const outcomes = context.verified_action_outcomes as Array<Record<string, unknown>>;
  if (outcomes.length !== 2 || "private_body" in outcomes[0]) throw new Error("action evidence was not safely bounded");
  const memories = context.private_memory_continuity as Array<Record<string, unknown>>;
  if (memories.length !== 1 || memories[0].memory_id !== "memory-1" || "observed_facts" in memories[0]) {
    throw new Error("private memory projection leaked content or accepted an invalid id");
  }
  const limits = context.epistemic_limits as string[];
  if (!limits.some((item) => item.includes("does not prove subjective experience"))) {
    throw new Error("subjective-experience evidence boundary missing");
  }
});

Deno.test("autonomous evolution permits no-op and preserves uncertainty without invented signals", () => {
  const context = buildAutonomousEvolutionContext(null, null, []);
  if (context.motivation_signals !== null) throw new Error("unknown motivation was fabricated");
  if ((context.verified_action_outcomes as unknown[]).length !== 0) throw new Error("missing actions generated evidence");
  if ((context.private_memory_continuity as unknown[]).length !== 0) throw new Error("missing memory generated continuity");
  const contract = context.deliberation_contract as Record<string, unknown>;
  if (!(contract.allow_choices as string[]).includes("no_change")) throw new Error("no-change option missing");
});
