import {
  buildSingaporeLegalGuidance,
  hasSingaporeLegalCapability,
  SINGAPORE_LEGAL_CAPABILITY,
  SINGAPORE_LEGAL_GUIDANCE_VERSION,
} from "./legal_intelligence_helpers.ts";

Deno.test("Alice legal capability requires the exact manifest capability", () => {
  if (!hasSingaporeLegalCapability([SINGAPORE_LEGAL_CAPABILITY])) {
    throw new Error("exact legal capability should enable Alice legal guidance");
  }
  for (const value of [
    null,
    "singapore_legal_intelligence",
    ["legal"],
    ["Singapore_legal_intelligence"],
    { singapore_legal_intelligence: true },
    ["singapore_legal_intelligence_extra"],
  ]) {
    if (hasSingaporeLegalCapability(value)) {
      throw new Error("unexpected value enabled legal capability");
    }
  }
});

Deno.test("Alice legal guidance covers all domains and official-source discipline", () => {
  const guidance = buildSingaporeLegalGuidance();
  for (const phrase of [
    "宪法与公法",
    "刑法",
    "公司与商业",
    "税务",
    "劳动",
    "家事",
    "土地与房地产",
    "数据保护",
    "环境气候",
    "国际法",
    "新加坡宪法",
    "ratio decidendi",
    "obiter dicta",
    "绝不编造法条",
    "尚未核实",
    "不是新加坡持牌律师",
    "不为各法律领域另起模型请求",
  ]) {
    if (!guidance.includes(phrase)) throw new Error("missing legal safeguard or domain: " + phrase);
  }
  if (!guidance.includes(SINGAPORE_LEGAL_GUIDANCE_VERSION)) {
    throw new Error("guidance version missing");
  }
});
