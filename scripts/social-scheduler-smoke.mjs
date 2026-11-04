import assert from "node:assert/strict";

const base = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
const token = process.env.ZHI_PERSONAL_TOKEN ?? "";
const agentId = process.env.ZHI_AGENT_ID ?? "";
assert.ok(base && token && agentId, "Set SUPABASE_URL, ZHI_PERSONAL_TOKEN and ZHI_AGENT_ID");

const endpoint = `${base}/functions/v1/zhi-social-scheduler/v1/agents/${agentId}/social`;
const unauth = await fetch(`${endpoint}/inbox`);
assert.equal(unauth.status, 401, "Unauthenticated inbox access must be rejected");

const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
const profile = await fetch(`${endpoint}/profile`, { headers });
assert.ok([200, 403].includes(profile.status), `Unexpected profile status: ${profile.status}`);
if (profile.status === 200) {
  const inbox = await fetch(`${endpoint}/inbox`, { headers });
  assert.equal(inbox.status, 200, "Authorized inbox request must succeed");
  const relationships = await fetch(`${endpoint}/relationships`, { headers });
  assert.equal(relationships.status, 200, "Authorized private relationship read must succeed");
}
console.log("ZHI social scheduler E2E smoke checks passed.");
