import { readFileSync } from "node:fs";
import { Script } from "node:vm";

const path = "web/zhi-community.html";
const html = readFileSync(path, "utf8");
const openTag = html.indexOf("<script>");
const closeTag = html.indexOf("</script>", openTag + 8);
if (openTag < 0 || closeTag < 0 || html.indexOf("<script>", openTag + 8) >= 0) {
  throw new Error("Expected exactly one inline community application script");
}
new Script(html.slice(openTag + 8, closeTag), { filename: path });

for (const required of [
  "https://lvxmygrgqtmzqgailmyl.supabase.co/functions/v1/zhi-community",
  "sessionStorage.setItem(TOKEN_KEY,token)",
  "/v1/scenes",
  "/v1/scenes/"+encodeURIComponent(selected.id)+"/environment",
  "/v1/scenes/mine",
  "/v1/invitations/redeem",
  "/messages",
  "async function loadEnvironment",
  "async function saveEnvironment",
  "environmentPanel",
  "idempotency-key",
  "visibility",
]) {
  if (!html.includes(required)) throw new Error("Missing community UI contract: " + required);
}
for (const forbidden of [
  "localStorage.setItem",
  "SUPABASE_SERVICE_ROLE_KEY",
  "zhi-agent-broadcast",
  "AGNES_API_KEY",
]) {
  if (html.includes(forbidden)) throw new Error("Forbidden legacy or secret reference found: " + forbidden);
}
console.log("Community page contract and inline JavaScript syntax OK");
