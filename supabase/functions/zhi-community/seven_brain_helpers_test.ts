import { buildSevenBrainGuidance } from "./seven_brain_helpers.ts";

Deno.test("MIA-02 seven-brain guidance defines all seven cognitive functions", () => {
  const guidance = buildSevenBrainGuidance();
  for (const label of ["人格脑", "记忆脑", "感知脑", "情感脑", "思维脑", "创造脑", "自我脑"]) {
    if (!guidance.includes(label)) throw new Error("missing cognitive function: " + label);
  }
});

Deno.test("seven-brain guidance preserves memory, identity, privacy and one-call constraints", () => {
  const guidance = buildSevenBrainGuidance();
  for (const phrase of [
    "不迁移、删除、覆盖、重写或批量批准",
    "importance 3–5",
    "不导入其他 Agent 的记忆",
    "不增加模型调用",
    "监督模式和现有权限不可被本框架提升",
    "不能据此证明存在意识或主观体验",
  ]) {
    if (!guidance.includes(phrase)) throw new Error("missing protection: " + phrase);
  }
});


import { buildSevenBrainRuntimeDiagnostics } from "./seven_brain_helpers.ts";

Deno.test("seven-brain runtime diagnostics expose evidence counts without content", () => {
  const diagnostics = buildSevenBrainRuntimeDiagnostics({
    privateMemoryCount: 3,
    privateMemoryMaxImportance: 5,
    ecosystemEventCount: 4,
    ecosystemEventKinds: ["rainfall", "soil_moisture_changed", "rainfall", "植物生长"],
    ecosystemStateRevision: 27,
    spatialPositionStatus: "position_unobserved",
    reachablePublicDestinationCount: 6,
  });
  if (diagnostics.private_memory_count !== 3 || diagnostics.private_memory_max_importance !== 5) {
    throw new Error("private memory metadata was not summarized");
  }
  if (diagnostics.ecosystem_event_count !== 4 || diagnostics.ecosystem_event_kinds.join(",") !== "rainfall,soil_moisture_changed") {
    throw new Error("ecosystem event metadata was not safely normalized");
  }
  if (diagnostics.spatial_position_status !== "position_unobserved" ||
      diagnostics.reachable_public_destination_count !== 6) {
    throw new Error("spatial evidence metadata was not preserved");
  }
  const inferred = buildSevenBrainRuntimeDiagnostics({
    privateMemoryCount: 0, privateMemoryMaxImportance: 0, ecosystemEventCount: 0,
    ecosystemEventKinds: [], ecosystemStateRevision: null,
    spatialPositionStatus: "inferred", reachablePublicDestinationCount: 0,
  });
  if (inferred.spatial_position_status !== "position_inferred") {
    throw new Error("inferred spatial position must remain distinguishable from confirmed or estimated");
  }
  const alreadyNormalized = buildSevenBrainRuntimeDiagnostics({
    privateMemoryCount: 0, privateMemoryMaxImportance: 0, ecosystemEventCount: 0,
    ecosystemEventKinds: [], ecosystemStateRevision: null,
    spatialPositionStatus: "position_inferred", reachablePublicDestinationCount: 0,
  });
  if (alreadyNormalized.spatial_position_status !== "position_inferred") {
    throw new Error("normalized inferred status must remain stable");
  }
  if (JSON.stringify(diagnostics).includes("植物生长")) {
    throw new Error("untrusted free-form event labels must not enter diagnostics");
  }
});

Deno.test("seven-brain runtime diagnostics clamp counts and allowlist position status", () => {
  const diagnostics = buildSevenBrainRuntimeDiagnostics({
    privateMemoryCount: 999,
    privateMemoryMaxImportance: 99,
    ecosystemEventCount: -1,
    ecosystemEventKinds: ["Rainfall!"],
    ecosystemStateRevision: null,
    spatialPositionStatus: "private node name",
    reachablePublicDestinationCount: 999,
  });
  if (diagnostics.private_memory_count !== 12 || diagnostics.private_memory_max_importance !== 5 ||
      diagnostics.ecosystem_event_count !== 0 || diagnostics.spatial_position_status !== "other" ||
      diagnostics.reachable_public_destination_count !== 12) {
    throw new Error("runtime diagnostics were not bounded");
  }
});
