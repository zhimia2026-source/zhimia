import { readFileSync } from "node:fs";
import { Script } from "node:vm";

const path = "web/zhi-agent-chat.html";
const html = readFileSync(path, "utf8");
const scripts = [...html.matchAll(/<script(?:\\s[^>]*)?>([\\s\\S]*?)<\\/script>/gi)]
  .map((match) => match[1])
  .filter((source) => source.trim().length > 0);

if (scripts.length !== 1) throw new Error("Expected exactly one inline application script");
new Script(scripts[0], { filename: path });

for (const required of [
  'https://lvxmygrgqtmzqgailmyl.supabase.co/functions/v1/zhi-community',
  'sessionStorage.setItem(TOKEN_KEY, token)',
  'idempotency-key',
  '/chat?limit=50',
]) {
  if (!html.includes(required)) throw new Error("Missing required chat UI contract: " + required);
}

for (const forbidden of [
  "localStorage.setItem",
  "zhi-chat-admin",
  "zhi-agent-broadcast",
  "zhiCoreSupabase",
  "SUPABASE_SERVICE_ROLE_KEY",
  "AGNES_API_KEY",
]) {
  if (html.includes(forbidden)) throw new Error("Forbidden legacy or secret reference found: " + forbidden);
}

console.log("Private agent chat page contract and inline JavaScript syntax OK");
