#!/usr/bin/env node
/**
 * Keep the canonical persona JSON and the runtime prompt profile in sync.
 * This is a static consistency check; it does not claim behavioral validation.
 */
import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync("config/zee-persona-config.json", "utf8"));
const prompt = readFileSync("supabase/functions/zhi-token-gateway/prompt.ts", "utf8");
const runtimeBlock = prompt.split("export const HEALTH_ADVISOR_SYSTEM_PROMPT =")[0];
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

expect(runtimeBlock.includes('schema_version: "' + config.schema_version + '"'),
  "schema_version differs between canonical JSON and runtime prompt");

for (const [key, value] of Object.entries(config.parameters)) {
  const pattern = new RegExp("\\b" + key + "\\s*:\\s*" + Number(value) + "\\b");
  expect(pattern.test(runtimeBlock), "parameter mismatch or missing runtime parameter: " + key);
}

for (const [key, description] of Object.entries(config.interpretation)) {
  expect(runtimeBlock.includes(key + ": " + JSON.stringify(description)),
    "interpretation mismatch or missing runtime interpretation: " + key);
}

if (failures.length) {
  console.error("Persona config consistency FAILED:");
  for (const failure of failures) console.error("- " + failure);
  process.exit(1);
}

console.log("Persona config consistency PASS (" +
  Object.keys(config.parameters).length + " parameters, " +
  Object.keys(config.interpretation).length + " interpretations, schema " +
  config.schema_version + ").");
