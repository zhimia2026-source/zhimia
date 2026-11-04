import {
  buildAgentAddress,
  isSameAgentAddress,
  parseAgentAddress,
} from "./agent_address_helpers.ts";

const ID = "6fb036fd-5456-40db-8cc8-b11c545eafda";

Deno.test("builds a stable canonical ZHI agent URI", () => {
  if (buildAgentAddress(ID) !== `zhi://agent/${ID}`) throw new Error("canonical address mismatch");
});

Deno.test("parses exact canonical agent addresses", () => {
  const parsed = parseAgentAddress(`zhi://agent/${ID}`);
  if (!parsed || parsed.agentId !== ID || parsed.resource !== "agent") {
    throw new Error("valid exact address rejected");
  }
});

Deno.test("rejects names, malformed IDs, and URI lookalikes", () => {
  const invalid = [
    "MIA",
    "zhi://agent/MIA",
    "zhi://agent/" + ID.toUpperCase(),
    "zhi://agent/" + ID + "/extra",
    "zhi://agent/" + ID + "?cloud=other",
    "https://example.com/agent/" + ID,
    "zhi://agents/" + ID,
    " zhi://agent/" + ID,
  ];
  for (const value of invalid) {
    if (parseAgentAddress(value) !== null) throw new Error(`accepted invalid address: ${value}`);
  }
});

Deno.test("identity comparison never falls back to display-name matching", () => {
  if (!isSameAgentAddress(`zhi://agent/${ID}`, `zhi://agent/${ID}`)) {
    throw new Error("same identity should match");
  }
  if (isSameAgentAddress("MIA", "MIA")) throw new Error("names are not identity addresses");
  if (isSameAgentAddress(`zhi://agent/${ID}`, "zhi://agent/6fb036fd-5456-40db-8cc8-b11c545eafdb")) {
    throw new Error("different identities must not match");
  }
});
