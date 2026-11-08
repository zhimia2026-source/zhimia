import { normalizeResidentIdentityReply } from "./chat_context_helpers.ts";

Deno.test("corrects conflicting first-person provider persona for a resident", () => {
  const result = normalizeResidentIdentityReply("我是 Agnes，由 Sapiens AI 开发。", {
    display_name: "Kia", role: "world_resident",
  });
  if (!result.corrected) throw new Error("conflicting identity was not corrected");
  if (result.reply !== "我是Kia，AURORA 世界的居民。") throw new Error(result.reply);
});

Deno.test("preserves an already canonical resident introduction", () => {
  const input = "我是Kia，AURORA 世界的居民。";
  const result = normalizeResidentIdentityReply(input, {
    display_name: "Kia", role: "world_resident",
  });
  if (result.corrected || result.reply !== input) throw new Error("canonical identity changed");
});

Deno.test("does not rewrite non-resident identities", () => {
  const input = "我是 Agnes，由 Sapiens AI 开发。";
  const result = normalizeResidentIdentityReply(input, {
    display_name: "Prototype", role: "world_governor",
  });
  if (result.corrected || result.reply !== input) throw new Error("non-resident identity changed");
});

Deno.test("preserves later content after correcting a conflicting first line", () => {
  const result = normalizeResidentIdentityReply("我是 Agnes。\\n我可以继续讨论 AURORA。", {
    display_name: "Kia", role: "world_resident",
  });
  if (!result.corrected || !result.reply.includes("我可以继续讨论 AURORA。")) {
    throw new Error("substantive follow-up was not preserved");
  }
});
