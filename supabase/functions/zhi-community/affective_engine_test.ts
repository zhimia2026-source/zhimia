import { buildAffectTemporalEvidence } from "./affective_engine.ts";

Deno.test("affect temporal evidence distinguishes repeated direction without claiming persistence", () => {
  const summary = buildAffectTemporalEvidence([
    { occurred_at: "2026-11-01T10:00:00Z", affect_delta: { seven_emotions: { joy: 0.2 } } },
    { occurred_at: "2026-11-05T10:00:00Z", affect_delta: { seven_emotions: { joy: 0.1 } } },
    { occurred_at: "2026-11-15T10:00:00Z", affect_delta: { seven_emotions: { joy: 0.15 } } },
  ]);
  const signals = summary.repeated_signals as Array<Record<string, unknown>>;
  const joy = signals.find((item) => item.group === "seven_emotions" && item.dimension === "joy");
  if (!joy) throw new Error("repeated joy evidence missing");
  if (joy.pattern !== "repeated_same_direction") throw new Error("same-direction pattern misclassified");
  if (joy.observation_count !== 3 || joy.positive_changes !== 3 || joy.negative_changes !== 0) {
    throw new Error("repeated evidence counts are incorrect");
  }
  if (joy.observed_span_days !== 14) throw new Error("observed time span is incorrect");
  const limits = summary.interpretation_limits as string[];
  if (!limits.some((item) => item.includes("do not prove continuous"))) {
    throw new Error("persistence limitation missing");
  }
});

Deno.test("affect temporal evidence preserves opposite-direction changes instead of averaging conflict", () => {
  const summary = buildAffectTemporalEvidence([
    { occurred_at: "2026-11-01T10:00:00Z", affect_delta: { relational: { trust: 0.25 } } },
    { occurred_at: "2026-11-04T10:00:00Z", affect_delta: { relational: { trust: -0.2 } } },
    { occurred_at: "2026-11-10T10:00:00Z", affect_delta: { relational: { trust: 0.1 } } },
  ]);
  const signals = summary.repeated_signals as Array<Record<string, unknown>>;
  const trust = signals.find((item) => item.group === "relational" && item.dimension === "trust");
  if (!trust || trust.pattern !== "mixed_directions") throw new Error("mixed emotional direction was flattened");
  if (trust.positive_changes !== 2 || trust.negative_changes !== 1) throw new Error("opposite directions were not retained");
});

Deno.test("affect temporal evidence ignores unknown dimensions, invalid values and isolated signals", () => {
  const summary = buildAffectTemporalEvidence([
    { occurred_at: "2026-11-01T10:00:00Z", affect_delta: {
      seven_emotions: { joy: 0.2, fabricated_dimension: 0.9 },
      relational: { trust: 0 },
    } },
    { occurred_at: "not-a-date", affect_delta: { seven_emotions: { joy: 0.3 } } },
    { occurred_at: "2026-11-02T10:00:00Z", affect_delta: { seven_emotions: { joy: Number.NaN } } },
  ]);
  const signals = summary.repeated_signals as Array<Record<string, unknown>>;
  if (signals.length !== 0) throw new Error("invalid or isolated signal was treated as a repeated pattern");
});
