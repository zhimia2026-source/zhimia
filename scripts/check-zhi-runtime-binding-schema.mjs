import { readFileSync } from "node:fs";

const path = "schemas/zhi-agent-runtime-binding-v1.schema.json";
const schema = JSON.parse(readFileSync(path, "utf8"));
const required = [
  "schema_version", "agent_id", "runtime_id", "key_id", "challenge_id",
  "nonce", "issued_at", "expires_at", "signature", "world_join_consent",
];
if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") {
  throw new Error("runtime binding schema must use JSON Schema 2020-12");
}
if (schema.properties.schema_version?.const !== "zhi.agent.runtime-binding.v1") {
  throw new Error("unexpected runtime binding schema version");
}
if (required.some((key) => !schema.required.includes(key))) {
  throw new Error("runtime binding schema is missing a required field");
}
if (schema.properties.signature?.properties?.alg?.const !== "EdDSA") {
  throw new Error("runtime proof must be EdDSA");
}
const scopes = schema.properties.world_join_consent?.properties?.scopes?.items?.enum ?? [];
if (scopes.length !== 2 || !scopes.includes("world.join") || !scopes.includes("biogenesis.submit")) {
  throw new Error("runtime join consent scopes must remain least-privilege");
}
if (schema.properties.signature?.properties?.value?.pattern !== "^[A-Za-z0-9_-]+$") {
  throw new Error("signature must be base64url encoded");
}
console.log("ZHI Agent Runtime Binding schema checks passed.");
