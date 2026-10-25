#!/usr/bin/env node
/**
 * Live E2E smoke tests for the deployed personal-token gateway.
 * Use disposable accounts and synthetic tokens only. Never commit token values.
 *
 * Required env:
 *   SUPABASE_ANON_KEY (publishable/anon key)
 *   HEALTH_TEST_A_TOKEN, HEALTH_TEST_B_TOKEN (disposable personal tokens)
 * Optional:
 *   SUPABASE_URL (defaults to the project's URL)
 *   HEALTH_ADVISOR_ALLOWED_ORIGIN (defaults to GitHub Pages origin)
 */
import { randomUUID } from "node:crypto";

const required = ["SUPABASE_ANON_KEY", "HEALTH_TEST_A_TOKEN", "HEALTH_TEST_B_TOKEN"];
for (const key of required) {
  if (!process.env[key]) {
    console.error("Missing required environment variable:", key);
    process.exit(2);
  }
}
const base = (process.env.SUPABASE_URL || "https://lvxmygrgqtmzqgailmyl.supabase.co").replace(/\/$/, "");
const api = base + "/functions/v1/zhi-token-gateway";
const anon = process.env.SUPABASE_ANON_KEY;
const origin = process.env.HEALTH_ADVISOR_ALLOWED_ORIGIN || "https://zhimia2026-source.github.io";
const badOrigin = "https://not-allowed.invalid";
const A = process.env.HEALTH_TEST_A_TOKEN;
const B = process.env.HEALTH_TEST_B_TOKEN;
const results = [];
let conversationId = null;

function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
  console.log((ok ? "PASS " : "FAIL ") + name + (detail ? " — " + detail : ""));
}
async function call(token, action, body = {}, reqOrigin = origin) {
  const headers = { apikey: anon, "content-type": "application/json" };
  if (token) headers.authorization = "Bearer " + token;
  if (reqOrigin) headers.origin = reqOrigin;
  return fetch(api, {
    method: "POST",
    headers,
    body: JSON.stringify({ action, ...body }),
  });
}
async function parse(response) {
  return response.json().catch(() => ({}));
}

try {
  const noAuth = await call("", "login");
  check("AUTH-01 missing personal token rejected", noAuth.status === 401, "HTTP " + noAuth.status);

  const deniedOrigin = await fetch(api, { method: "OPTIONS", headers: { origin: badOrigin } });
  check("NET-01 unapproved browser origin rejected", deniedOrigin.status === 403, "HTTP " + deniedOrigin.status);

  const loginAResponse = await call(A, "login");
  const loginA = await parse(loginAResponse);
  check("AUTH-02 token A authenticated", loginAResponse.ok && loginA.ok === true, "HTTP " + loginAResponse.status);
  const loginBResponse = await call(B, "login");
  const loginB = await parse(loginBResponse);
  check("AUTH-03 token B authenticated", loginBResponse.ok && loginB.ok === true, "HTTP " + loginBResponse.status);
  if (!loginAResponse.ok || !loginBResponse.ok) throw new Error("Disposable token login failed; check token validity.");

  // No consent: safety response must remain transient.
  const revoke = await call(A, "consent_set", { granted: false });
  check("CONSENT-01 can disable chat storage", revoke.ok, "HTTP " + revoke.status);
  const transientResponse = await call(A, "chat", {
    request_id: randomUUID(),
    message: "合成测试：我现在严重胸痛并且呼吸困难。",
  });
  const transient = await parse(transientResponse);
  check("CHAT-01 no-consent safety response is transient",
    transientResponse.ok && transient.safety_override === true &&
    transient.persisted === false && transient.conversation_id === null,
    "HTTP " + transientResponse.status);

  // Consent and persist only synthetic safety test content.
  const grant = await call(A, "consent_set", { granted: true });
  check("CONSENT-02 can enable storage for test identity", grant.ok, "HTTP " + grant.status);
  if (grant.ok) {
    const persistedResponse = await call(A, "chat", {
      request_id: randomUUID(),
      message: "合成测试：我现在严重胸痛并且呼吸困难。",
    });
    const persisted = await parse(persistedResponse);
    conversationId = persisted.conversation_id || null;
    check("CHAT-02 consented safety response persisted",
      persistedResponse.ok && persisted.safety_override === true &&
      persisted.persisted === true && Boolean(conversationId),
      "HTTP " + persistedResponse.status);

    if (conversationId) {
      await call(B, "consent_set", { granted: true });
      const listBResponse = await call(B, "conversations");
      const listB = await parse(listBResponse);
      const visibleToB = (listB.items || []).some(item => item.id === conversationId);
      check("PRIV-01 account B cannot see account A conversation",
        listBResponse.ok && !visibleToB, "HTTP " + listBResponse.status);

      const messagesBResponse = await call(B, "messages", { conversation_id: conversationId });
      const messagesB = await parse(messagesBResponse);
      check("PRIV-02 account B cannot read account A messages",
        messagesBResponse.ok && Array.isArray(messagesB.items) && messagesB.items.length === 0,
        "HTTP " + messagesBResponse.status);

      const deleteBResponse = await call(B, "delete_conversation", { conversation_id: conversationId });
      const listAResponse = await call(A, "conversations");
      const listA = await parse(listAResponse);
      const stillVisibleToA = (listA.items || []).some(item => item.id === conversationId);
      check("PRIV-03 account B cannot delete account A conversation",
        deleteBResponse.ok && stillVisibleToA, "delete HTTP " + deleteBResponse.status);
    } else {
      check("PRIV-01/02/03 cross-account isolation", false, "No persisted conversation ID returned.");
    }

    const revoked = await call(A, "consent_set", { granted: false });
    const afterRevocationResponse = await call(A, "chat", {
      request_id: randomUUID(),
      message: "合成测试：我现在严重胸痛并且呼吸困难。",
    });
    const afterRevocation = await parse(afterRevocationResponse);
    check("CONSENT-03 revocation stops subsequent persistence",
      revoked.ok && afterRevocationResponse.ok && afterRevocation.persisted === false &&
      afterRevocation.conversation_id === null,
      "HTTP " + afterRevocationResponse.status);
  }

} catch (error) {
  console.error("E2E aborted:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  // Clean up synthetic test conversation if possible. Keep storage disabled on disposable A.
  try {
    if (conversationId) await call(A, "delete_conversation", { conversation_id: conversationId });
    await call(A, "consent_set", { granted: false });
    await call(B, "consent_set", { granted: false });
  } catch {
    console.error("Cleanup warning: manually review the disposable test identity for synthetic test data.");
  }
  const failed = results.filter(result => !result.ok);
  console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
  if (failed.length) process.exitCode = 1;
}
