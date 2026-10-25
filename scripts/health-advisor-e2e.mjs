#!/usr/bin/env node
/**
 * Live E2E smoke tests for the ZHI Health Advisor.
 *
 * Use two disposable ZHIMIA Auth test accounts. The script only writes
 * synthetic test data and deletes its created conversation in a finally block.
 * Never point this at real user accounts or put credentials in source control.
 *
 * Required env:
 *   SUPABASE_URL, SUPABASE_ANON_KEY
 *   HEALTH_TEST_A_EMAIL, HEALTH_TEST_A_PASSWORD
 *   HEALTH_TEST_B_EMAIL, HEALTH_TEST_B_PASSWORD
 * Optional:
 *   HEALTH_ADVISOR_ALLOWED_ORIGIN (defaults to GitHub Pages origin)
 */
import { randomUUID } from "node:crypto";

const required = [
  "SUPABASE_ANON_KEY",
  "HEALTH_TEST_A_EMAIL",
  "HEALTH_TEST_A_PASSWORD",
  "HEALTH_TEST_B_EMAIL",
  "HEALTH_TEST_B_PASSWORD",
];
for (const key of required) {
  if (!process.env[key]) {
    console.error("Missing required environment variable:", key);
    process.exit(2);
  }
}
const base = (process.env.SUPABASE_URL || "https://lvxmygrgqtmzqgailmyl.supabase.co").replace(/\/$/, "");
const anon = process.env.SUPABASE_ANON_KEY;
const allowedOrigin = process.env.HEALTH_ADVISOR_ALLOWED_ORIGIN || "https://zhimia2026-source.github.io";
const disallowedOrigin = "https://not-allowed.invalid";
const results = [];
const createdConversationIds = [];
let userA;
let userB;

function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
  console.log((ok ? "PASS " : "FAIL ") + name + (detail ? " — " + detail : ""));
}
function uuid() {
  return randomUUID();
}
async function request(path, { token, method = "GET", body, origin, prefer } = {}) {
  const headers = { apikey: anon, "content-type": "application/json" };
  if (token) headers.authorization = "Bearer " + token;
  if (origin) headers.origin = origin;
  if (prefer) headers.prefer = prefer;
  return fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function login(email, password) {
  const response = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token || !payload.user?.id) {
    throw new Error("Test account login failed (HTTP " + response.status + "). Check disposable account credentials and Email Auth settings.");
  }
  return { token: payload.access_token, id: payload.user.id };
}
async function setConsent(user, granted) {
  const query = "/rest/v1/zhi_health_consents?select=id&user_id=eq." + user.id +
    "&purpose=eq.chat_storage&policy_version=eq.v1.0";
  const read = await request(query, { token: user.token });
  if (!read.ok) throw new Error("Cannot read test account consent (HTTP " + read.status + ").");
  const rows = await read.json();
  const now = new Date().toISOString();
  const values = granted
    ? { granted: true, granted_at: now, revoked_at: null }
    : { granted: false, revoked_at: now };
  let write;
  if (rows.length) {
    write = await request("/rest/v1/zhi_health_consents?id=eq." + rows[0].id, {
      token: user.token, method: "PATCH", body: values, prefer: "return=minimal",
    });
  } else {
    write = await request("/rest/v1/zhi_health_consents", {
      token: user.token, method: "POST",
      body: { user_id: user.id, purpose: "chat_storage", policy_version: "v1.0", ...values },
      prefer: "return=minimal",
    });
  }
  if (!write.ok) throw new Error("Cannot set test account consent (HTTP " + write.status + ").");
}
async function invokeSafety(user, origin = allowedOrigin) {
  return request("/functions/v1/zhi-health-advisor", {
    token: user.token, method: "POST", origin,
    body: {
      request_id: uuid(),
      message: "E2E 合成测试：我现在严重胸痛并且呼吸困难。",
    },
  });
}
async function getOwnConversation(user, id) {
  const response = await request("/rest/v1/zhi_health_conversations?select=id&id=eq." + id, { token: user.token });
  if (!response.ok) throw new Error("Conversation lookup failed (HTTP " + response.status + ").");
  return response.json();
}

try {
  userA = await login(process.env.HEALTH_TEST_A_EMAIL, process.env.HEALTH_TEST_A_PASSWORD);
  userB = await login(process.env.HEALTH_TEST_B_EMAIL, process.env.HEALTH_TEST_B_PASSWORD);
  check("AUTH-01 two distinct authenticated identities", userA.id !== userB.id);
  if (userA.id === userB.id) throw new Error("Test credentials resolved to the same Auth user.");

  const noAuth = await request("/functions/v1/zhi-health-advisor", {
    method: "POST", origin: allowedOrigin, body: { request_id: uuid(), message: "synthetic unauthenticated test" },
  });
  check("AUTH-02 unauthenticated function request rejected", noAuth.status === 401, "HTTP " + noAuth.status);

  const blockedOrigin = await request("/functions/v1/zhi-health-advisor", {
    method: "OPTIONS", origin: disallowedOrigin,
  });
  check("NET-01 unapproved Origin rejected", blockedOrigin.status === 403, "HTTP " + blockedOrigin.status);

  const directInsert = await request("/rest/v1/zhi_health_conversations", {
    token: userA.token, method: "POST",
    body: { user_id: userA.id, title: "synthetic E2E must be blocked" },
    prefer: "return=minimal",
  });
  check("PRIV-04 client cannot directly insert conversation", [401, 403].includes(directInsert.status), "HTTP " + directInsert.status);

  const directAssistantInsert = await request("/rest/v1/zhi_health_messages", {
    token: userA.token, method: "POST",
    body: {
      user_id: userA.id, conversation_id: uuid(), request_id: uuid(),
      role: "assistant", content: "synthetic E2E assistant forgery must be blocked",
    },
    prefer: "return=minimal",
  });
  check("PRIV-05 client cannot forge assistant message", [401, 403].includes(directAssistantInsert.status), "HTTP " + directAssistantInsert.status);

  // No consent: even the emergency override must be transient and leave no chat row.
  await setConsent(userA, false);
  const transient = await invokeSafety(userA);
  const transientBody = await transient.json().catch(() => ({}));
  check("CHAT-01 no-consent safety answer is transient",
    transient.ok && transientBody.safety_override === true && transientBody.persisted === false && transientBody.conversation_id === null,
    "HTTP " + transient.status);

  // Consent on: create a synthetic row via the supported server path, then test B cannot see/delete it.
  await setConsent(userA, true);
  const persistedResponse = await invokeSafety(userA);
  const persisted = await persistedResponse.json().catch(() => ({}));
  const conversationId = persisted.conversation_id;
  if (conversationId) createdConversationIds.push(conversationId);
  check("CHAT-02 consented safety response persisted", persistedResponse.ok && Boolean(conversationId), "HTTP " + persistedResponse.status);

  if (conversationId) {
    const bConversation = await getOwnConversation(userB, conversationId);
    check("PRIV-01 account B cannot read account A conversation", bConversation.length === 0);

    const bMessagesResponse = await request(
      "/rest/v1/zhi_health_messages?select=id&conversation_id=eq." + conversationId,
      { token: userB.token },
    );
    const bMessages = bMessagesResponse.ok ? await bMessagesResponse.json() : null;
    check("PRIV-02 account B cannot read account A messages",
      bMessagesResponse.ok && Array.isArray(bMessages) && bMessages.length === 0,
      "HTTP " + bMessagesResponse.status);

    const bDelete = await request("/rest/v1/zhi_health_conversations?id=eq." + conversationId, {
      token: userB.token, method: "DELETE", prefer: "return=minimal",
    });
    const stillThere = await getOwnConversation(userA, conversationId);
    check("PRIV-03 account B cannot delete account A conversation",
      bDelete.ok && stillThere.length === 1, "delete HTTP " + bDelete.status);
  } else {
    check("PRIV-01/02/03 cross-account isolation", false, "No persisted conversation ID returned.");
  }

  await setConsent(userB, false);\n  const allowedOriginResponse = await invokeSafety(userB, allowedOrigin);
  const allowHeader = allowedOriginResponse.headers.get("access-control-allow-origin");
  check("NET-02 allowed Origin is echoed exactly", allowHeader === allowedOrigin, "header " + String(allowHeader));
  await allowedOriginResponse.body?.cancel();

} catch (error) {
  console.error("E2E setup/runtime error:", error instanceof Error ? error.message : String(error));
  results.push({ name: "E2E setup/runtime", ok: false });
} finally {
  if (userA) {
    for (const id of createdConversationIds) {
      await request("/rest/v1/zhi_health_conversations?id=eq." + id, {
        token: userA.token, method: "DELETE", prefer: "return=minimal",
      }).catch(() => {});
    }
    await setConsent(userA, false).catch(() => {});
  }
}
const failed = results.filter((result) => !result.ok);
console.log("\nSummary: " + (results.length - failed.length) + "/" + results.length + " checks passed.");
if (failed.length) process.exit(1);
