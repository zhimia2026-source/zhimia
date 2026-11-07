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
  ]) {
    if (!guidance.includes(phrase)) throw new Error("missing protection: " + phrase);
  }
});
