export const ZHI_AGENT_URI_PREFIX = "zhi://agent/";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type ParsedAgentAddress = {
  scheme: "zhi";
  resource: "agent";
  agentId: string;
  canonicalUri: string;
};

/**
 * Build a canonical, stable logical address. This is an identifier only:
 * it deliberately contains no cloud, endpoint, world, or authorization data.
 */
export function buildAgentAddress(agentId: string): string {
  if (typeof agentId !== "string" || !UUID_PATTERN.test(agentId)) {
    throw new Error("invalid_agent_id");
  }
  return `${ZHI_AGENT_URI_PREFIX}${agentId}`;
}

/**
 * Parse only the exact canonical ZHI agent URI. No name lookup, URL decoding,
 * case folding, query strings, fragments, or trailing path segments are allowed.
 */
export function parseAgentAddress(value: unknown): ParsedAgentAddress | null {
  if (typeof value !== "string" || !value.startsWith(ZHI_AGENT_URI_PREFIX)) return null;
  const agentId = value.slice(ZHI_AGENT_URI_PREFIX.length);
  if (!UUID_PATTERN.test(agentId)) return null;
  return {
    scheme: "zhi",
    resource: "agent",
    agentId,
    canonicalUri: value,
  };
}

/** Exact identity comparison; display names and endpoint URLs are never considered. */
export function isSameAgentAddress(left: unknown, right: unknown): boolean {
  const a = parseAgentAddress(left);
  const b = parseAgentAddress(right);
  return !!a && !!b && a.agentId === b.agentId;
}
