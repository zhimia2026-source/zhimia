import { assertEquals } from "jsr:@std/assert@1";
import { canAccessPrivateCognition, validateMouRecord, type MouRecord } from "./ontology_helpers.ts";

const valid: MouRecord = {
  id: "mou-1", owner_user_id: "user-a", agent_id: "agent-a",
  object_type: "world", object_id: "forest-1", state: { weather: "rain" },
  relation_ids: ["rel-1"], evidence_kind: "observation", source_ids: ["event-1"],
  confidence: 0.9, event_time: "2026-10-30T08:00:00Z",
  recorded_at: "2026-10-30T08:01:00Z", inferred_at: null,
  hypothesis: null, prediction: null, version: 1,
};

Deno.test("accepts a sourced observation with separate event and record times", () => {
  assertEquals(validateMouRecord(valid).valid, true);
});

Deno.test("rejects unknown evidence disguised with a confidence score", () => {
  const result = validateMouRecord({ ...valid, evidence_kind: "unknown", confidence: 0.8 });
  assertEquals(result.errors.includes("unknown_confidence_must_be_null"), true);
});

Deno.test("unknown may be represented without invented confidence or sources", () => {
  const result = validateMouRecord({ ...valid, evidence_kind: "unknown", confidence: null, source_ids: [] });
  assertEquals(result.valid, true);
});

Deno.test("facts and observations require traceable sources", () => {
  assertEquals(validateMouRecord({ ...valid, source_ids: [] }).errors.includes("observation_requires_source"), true);
  assertEquals(validateMouRecord({ ...valid, evidence_kind: "fact", source_ids: [], confidence: 1 }).errors.includes("fact_requires_source"), true);
});

Deno.test("inference requires inference time and hypotheses require text", () => {
  assertEquals(validateMouRecord({ ...valid, evidence_kind: "inference", inferred_at: null }).errors.includes("inference_requires_inferred_at"), true);
  assertEquals(validateMouRecord({ ...valid, evidence_kind: "hypothesis", hypothesis: " " }).errors.includes("hypothesis_requires_text"), true);
});

Deno.test("rejects malformed timestamps, confidence and object types", () => {
  const result = validateMouRecord({ ...valid, event_time: "yesterday", confidence: 2, object_type: "planet" });
  assertEquals(result.valid, false);
});

Deno.test("private cognition is isolated by both owner and agent", () => {
  const record = { owner_user_id: "user-a", agent_id: "agent-a" };
  assertEquals(canAccessPrivateCognition(record, "user-a", "agent-a"), true);
  assertEquals(canAccessPrivateCognition(record, "user-b", "agent-a"), false);
  assertEquals(canAccessPrivateCognition(record, "user-a", "agent-b"), false);
  assertEquals(canAccessPrivateCognition(null, "user-a", "agent-a"), false);
});


Deno.test("unknown cannot carry an inferred explanation or prediction", () => {
  const result = validateMouRecord({
    ...valid, evidence_kind: "unknown", confidence: null, source_ids: [],
    hypothesis: "probably rain", prediction: "rain tomorrow",
  });
  assertEquals(result.errors.includes("unknown_must_not_claim_inference_or_prediction"), true);
});

Deno.test("hypotheses require both inference time and traceable evidence", () => {
  const noTime = validateMouRecord({
    ...valid, evidence_kind: "hypothesis", inferred_at: null,
    hypothesis: "rain may begin", prediction: "rain before noon",
  });
  assertEquals(noTime.errors.includes("hypothesis_requires_inferred_at"), true);
  const noSource = validateMouRecord({
    ...valid, evidence_kind: "hypothesis", inferred_at: "2026-10-30T08:02:00Z",
    hypothesis: "rain may begin", prediction: null, source_ids: [],
  });
  assertEquals(noSource.errors.includes("hypothesis_requires_source"), true);
});
