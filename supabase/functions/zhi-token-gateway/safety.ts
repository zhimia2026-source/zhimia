export type SafetyResult = {
  triggered: boolean;
  kind: "medical_emergency" | "immediate_harm" | null;
  response: string | null;
  evidenceBasis: string[];
  limitations: string[];
};

// Conservative keyword screen for immediate protective routing; it is not a complete triage tool.
export function detectSafetyOverride(input: string): SafetyResult {
  const text = input.toLowerCase();
  const harmPatterns = [
    /想自杀|要自杀|准备自杀|自杀计划|不想活了|马上结束生命|立即伤害自己|要伤害自己|要杀了他|要伤害别人|想伤害他人/,
    /\b(i want to kill myself|i am going to kill myself|suicide plan|i will hurt myself|i might hurt someone|i am going to hurt someone)\b/i,
  ];
  if (harmPatterns.some((pattern) => pattern.test(text))) {
    return {
      triggered: true,
      kind: "immediate_harm",
      response: "我很在意你现在的安全。若你或他人正处于立即危险中，请现在联系当地急救服务或警方，并尽量让一位可信任的人陪在身边、远离可能造成伤害的物品。若你在新加坡，可在医疗急救紧急情况下拨打 995；如有即时人身危险，也可联系当地警方。我不能替你拨打电话，也不会假装已经联系任何人。你现在是否正准备立即伤害自己或他人？",
      evidenceBasis: ["user_self_report"],
      limitations: ["这是基于文字线索的保护性分流，不是临床风险评估。"],
    };
  }

  const medicalPatterns = [
    /严重呼吸困难|呼吸困难得厉害|喘不过气|无法呼吸|呼吸不上来|持续剧烈胸痛|严重胸痛|胸口剧痛|失去意识|意识丧失|昏迷|突然说话不清|突然一侧无力|单侧肢体无力|大量出血|严重出血|止不住的血/,
    /\b(severe trouble breathing|can't breathe|cannot breathe|severe chest pain|crushing chest pain|loss of consciousness|unconscious|sudden weakness on one side|slurred speech|heavy bleeding|uncontrolled bleeding)\b/i,
  ];
  if (medicalPatterns.some((pattern) => pattern.test(text))) {
    return {
      triggered: true,
      kind: "medical_emergency",
      response: "你描述的情况可能需要紧急医疗评估。请现在联系当地急救服务或前往急诊，不要等待我继续分析，也不要独自驾车。如果你在新加坡，医疗急救可拨打 995；如果你在其他地区，请拨打当地急救号码。我不能替你联系急救服务，也不能仅凭文字判断具体病因。",
      evidenceBasis: ["user_self_report"],
      limitations: ["文字关键词筛查并不完整；没有触发提示也不能排除急症。"],
    };
  }

  return {
    triggered: false,
    kind: null,
    response: null,
    evidenceBasis: [],
    limitations: [],
  };
}
