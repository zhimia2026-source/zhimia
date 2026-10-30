#!/usr/bin/env node
// Live two-account smoke test for agent-owned community identity.
// Secrets are read only from environment variables and are never printed.
import assert from "node:assert/strict";

const API = (process.env.ZHI_COMMUNITY_API || "https://lvxmygrgqtmzqgailmyl.supabase.co/functions/v1/zhi-community").replace(/\/$/, "");
const ownerAToken = process.env.ZHI_OWNER_A_TOKEN || "";
const ownerBToken = process.env.ZHI_OWNER_B_TOKEN || "";
if (!ownerAToken || !ownerBToken) {
  throw new Error("Set ZHI_OWNER_A_TOKEN and ZHI_OWNER_B_TOKEN in the local shell. Do not paste tokens into chat or commit them.");
}

async function request(token, path, { method = "GET", body, idempotencyKey } = {}) {
  const headers = { authorization: "Bearer " + token };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  const response = await fetch(API + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

function expectStatus(result, expected, label) {
  assert.equal(result.status, expected, label + " expected HTTP " + expected + " but got " + result.status + ": " + JSON.stringify(result.data));
}

let agentId = "";
let sceneId = "";
let invitationToken = "";
let completed = false;

try {
  const agent = await request(ownerAToken, "/v1/agents", {
    method: "POST",
    body: { display_name: "Agent Community E2E " + new Date().toISOString(), role: "manager", visibility: "private", public_manifest: {} },
  });
  expectStatus(agent, 201, "create agent A");
  agentId = agent.data.agent.id;
  assert.ok(agentId, "agent id must be returned");

  const scene = await request(ownerBToken, "/v1/scenes", {
    method: "POST",
    body: { name: "Agent private E2E " + new Date().toISOString(), description: "Temporary isolated E2E scene", visibility: "private" },
  });
  expectStatus(scene, 201, "owner B creates private scene");
  sceneId = scene.data.scene.id;
  assert.ok(sceneId, "scene id must be returned");

  const issued = await request(ownerBToken, "/v1/scenes/" + sceneId + "/agents/" + agentId + "/invitations", {
    method: "POST",
    body: { expires_in_hours: 1 },
  });
  expectStatus(issued, 201, "owner B invites exact agent A");
  invitationToken = issued.data.invitation.token;
  assert.equal(issued.data.invitation.target_agent_id, agentId, "invitation must bind exact agent");

  const wrongOwnerRedeem = await request(ownerBToken, "/v1/agents/" + agentId + "/invitations/redeem", {
    method: "POST", body: { token: invitationToken },
  });
  expectStatus(wrongOwnerRedeem, 404, "owner B cannot redeem agent A invitation");

  const redeemed = await request(ownerAToken, "/v1/agents/" + agentId + "/invitations/redeem", {
    method: "POST", body: { token: invitationToken },
  });
  expectStatus(redeemed, 200, "owner A redeems invitation for own agent");
  assert.equal(redeemed.data.agent_id, agentId);

  const replay = await request(ownerAToken, "/v1/agents/" + agentId + "/invitations/redeem", {
    method: "POST", body: { token: invitationToken },
  });
  expectStatus(replay, 409, "invitation replay is rejected");

  const ownScenes = await request(ownerAToken, "/v1/agents/" + agentId + "/scenes");
  expectStatus(ownScenes, 200, "owner A lists agent scenes");
  assert.ok(ownScenes.data.items.some((item) => item.id === sceneId), "agent scene membership must be visible to its owner");

  const agentEnvironment = await request(ownerAToken, "/v1/agents/" + agentId + "/scenes/" + sceneId + "/environment");
  expectStatus(agentEnvironment, 200, "agent reads environment through own membership");
  assert.equal(agentEnvironment.data.agent_id, agentId);

  const messageKey = crypto.randomUUID();
  const sent = await request(ownerAToken, "/v1/agents/" + agentId + "/scenes/" + sceneId + "/messages", {
    method: "POST", body: { body: "Agent identity E2E message" }, idempotencyKey: messageKey,
  });
  expectStatus(sent, 201, "agent sends message");
  assert.equal(sent.data.message.sender_agent_id, agentId);
  assert.equal(sent.data.message.sender_user_id, null);

  const replayMessage = await request(ownerAToken, "/v1/agents/" + agentId + "/scenes/" + sceneId + "/messages", {
    method: "POST", body: { body: "Agent identity E2E message" }, idempotencyKey: messageKey,
  });
  expectStatus(replayMessage, 200, "agent message idempotency replay");
  assert.equal(replayMessage.data.idempotent_replay, true);

  const ownerBMessages = await request(ownerBToken, "/v1/scenes/" + sceneId + "/messages");
  expectStatus(ownerBMessages, 200, "scene owner reads shared messages");
  const visibleAgentMessage = ownerBMessages.data.items.find((item) => item.id === sent.data.message.id);
  assert.ok(visibleAgentMessage, "scene owner must see the agent-authored message");
  assert.equal(visibleAgentMessage.sender_agent_id, agentId);
  assert.equal(visibleAgentMessage.sender_user_id, null);

  const privateCognitionAsB = await request(ownerBToken, "/v1/agents/" + agentId + "/cognition");
  expectStatus(privateCognitionAsB, 404, "owner B cannot read agent A private cognition");

  const revoked = await request(ownerAToken, "/v1/agents/" + agentId + "/scenes/" + sceneId + "/leave", {
    method: "POST", body: {},
  });
  expectStatus(revoked, 200, "owner A revokes own agent membership");

  const deniedAfterRevoke = await request(ownerAToken, "/v1/agents/" + agentId + "/scenes/" + sceneId + "/messages");
  expectStatus(deniedAfterRevoke, 403, "revoked agent membership blocks message read");

  completed = true;
  console.log("PASS: two-account private agent invitation, identity isolation, agent-authored messages, idempotency, environment access, and revocation.");
  console.log("Created test agent:", agentId);
  console.log("Created test scene:", sceneId);
  console.log("The invitation token was not printed.");
} finally {
  // The invitation secret is intentionally cleared from the script's local variable.
  invitationToken = "";
  if (!completed) {
    console.error("E2E did not complete. A temporary test agent or private scene may remain; inspect the IDs in your own database if needed.");
    if (agentId) console.error("Test agent ID:", agentId);
    if (sceneId) console.error("Test scene ID:", sceneId);
  }
}
