#!/usr/bin/env node
// Disposable-project E2E test for ZHI private micro-experience memory.
// Tokens are read only from environment variables and are never printed.
import assert from "node:assert/strict";

const memoryApi = (process.env.ZHI_MEMORY_API || "").replace(/\/$/, "");
const communityApi = (process.env.ZHI_COMMUNITY_API || "").replace(/\/$/, "");
if (!memoryApi || !communityApi) throw new Error("Set ZHI_MEMORY_API and ZHI_COMMUNITY_API to a disposable test project's Edge Function URLs.");
if (memoryApi.includes("lvxmygrgqtmzqgailmyl.supabase.co") || communityApi.includes("lvxmygrgqtmzqgailmyl.supabase.co")) {
  throw new Error("Refusing to run fixture-creating memory E2E tests against the production ZHI project.");
}
if (process.env.ZHI_E2E_DISPOSABLE_PROJECT !== "1") {
  throw new Error("Set ZHI_E2E_DISPOSABLE_PROJECT=1 only after confirming both URLs point to a disposable test project.");
}

const ownerToken = process.env.ZHI_MEMORY_OWNER_TOKEN || "";
const otherToken = process.env.ZHI_MEMORY_OTHER_TOKEN || "";
const limitedToken = process.env.ZHI_MEMORY_LIMITED_TOKEN || "";
if (!ownerToken || !otherToken || !limitedToken) {
  throw new Error("Set owner, other-account, and limited-scope test tokens locally. Never paste tokens into chat or commit them.");
}

async function request(base, token, path, { method = "GET", body } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      authorization: "Bearer " + token,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}
function expect(result, status, label) {
  assert.equal(result.status, status, label + " expected HTTP " + status + " but got " + result.status);
}

let agentId = "";
let experienceId = "";
let limitedAgentId = "";
let finished = false;
try {
  const createdAgent = await request(communityApi, ownerToken, "/v1/agents", {
    method: "POST",
    body: { display_name: "Memory E2E " + new Date().toISOString(), role: "manager", visibility: "private", public_manifest: {} },
  });
  expect(createdAgent, 201, "owner creates agent");
  agentId = createdAgent.data.agent?.id;
  assert.ok(agentId, "agent id required");

  const candidate = await request(memoryApi, ownerToken, "/v1/agents/" + agentId + "/micro-experiences", {
    method: "POST",
    body: {
      experience_type: "observation",
      source_kind: "direct_observation",
      observed_facts: [{ claim: "The light moved across the reading desk." }],
      hypotheses: [{ claim: "The sun angle may have changed." }],
      unknowns: ["The source of the airflow is unknown."],
      reflection: "Observe again before accepting the explanation.",
      importance: 3,
    },
  });
  expect(candidate, 201, "owner creates candidate");
  experienceId = candidate.data.item?.id;
  assert.ok(experienceId, "experience id required");
  assert.equal(candidate.data.item.memory_status, "candidate");

  const defaultList = await request(memoryApi, ownerToken, "/v1/agents/" + agentId + "/micro-experiences");
  expect(defaultList, 200, "default list");
  assert.equal(defaultList.data.items.some((x) => x.id === experienceId), false, "candidate must not appear in approved-only default list");

  const allList = await request(memoryApi, ownerToken, "/v1/agents/" + agentId + "/micro-experiences?status=all");
  expect(allList, 200, "owner lists all states");
  assert.equal(allList.data.items.some((x) => x.id === experienceId), true);

  const crossRead = await request(memoryApi, otherToken, "/v1/agents/" + agentId + "/micro-experiences?status=all");
  expect(crossRead, 404, "other account cannot discover/read owner agent memory");
  const crossDelete = await request(memoryApi, otherToken, "/v1/micro-experiences?id=" + experienceId, { method: "DELETE" });
  expect(crossDelete, 404, "other account cannot delete owner memory");

  const limitedAgent = await request(communityApi, limitedToken, "/v1/agents", {
    method: "POST",
    body: { display_name: "Limited Memory E2E " + new Date().toISOString(), role: "manager", visibility: "private", public_manifest: {} },
  });
  expect(limitedAgent, 201, "limited-scope owner creates own agent");
  limitedAgentId = limitedAgent.data.agent?.id;
  assert.ok(limitedAgentId, "limited agent id required");

  const noRead = await request(memoryApi, limitedToken, "/v1/agents/" + limitedAgentId + "/micro-experiences");
  expect(noRead, 403, "missing memory.read scope");
  const noWrite = await request(memoryApi, limitedToken, "/v1/agents/" + limitedAgentId + "/micro-experiences", {
    method: "POST",
    body: {
      experience_type: "observation",
      source_kind: "direct_observation",
      observed_facts: [{ claim: "Scope check fixture." }],
    },
  });
  expect(noWrite, 403, "missing memory.write scope");
  const noApprove = await request(memoryApi, limitedToken, "/v1/micro-experiences/" + experienceId + "/review", {
    method: "POST", body: { status: "approved" },
  });
  expect(noApprove, 403, "missing memory.approve scope");
  const noDelete = await request(memoryApi, limitedToken, "/v1/micro-experiences?id=" + experienceId, { method: "DELETE" });
  expect(noDelete, 403, "missing memory.delete scope");

  const approved = await request(memoryApi, ownerToken, "/v1/micro-experiences/" + experienceId + "/review", {
    method: "POST", body: { status: "approved" },
  });
  expect(approved, 200, "owner approves candidate");
  assert.equal(approved.data.item.memory_status, "approved");

  const approvedList = await request(memoryApi, ownerToken, "/v1/agents/" + agentId + "/micro-experiences");
  expect(approvedList, 200, "approved-only default list after approval");
  assert.equal(approvedList.data.items.some((x) => x.id === experienceId), true);

  const archived = await request(memoryApi, ownerToken, "/v1/micro-experiences/" + experienceId + "/review", {
    method: "POST", body: { status: "archived" },
  });
  expect(archived, 200, "owner archives approved memory");
  assert.equal(archived.data.item.memory_status, "archived");

  const deleted = await request(memoryApi, ownerToken, "/v1/micro-experiences?id=" + experienceId, { method: "DELETE" });
  expect(deleted, 200, "owner hard deletes memory");
  assert.equal(deleted.data.deleted, true);

  finished = true;
  console.log("PASS: private micro-experience create/list/review/archive/delete, owner isolation, and missing-scope rejection.");
} finally {
  if (!finished) {
    console.error("Memory E2E did not complete. Disposable test agents may remain.");
    if (agentId) console.error("Owner test agent ID:", agentId);
    if (limitedAgentId) console.error("Limited-scope test agent ID:", limitedAgentId);
    if (experienceId) console.error("Experience ID:", experienceId);
  }
}
