export type CareAction = "list" | "get" | "create" | "request_approval" | "approve_action" | "transition" | "add_evidence";

const REQUIRED_CAPABILITIES: Record<CareAction, string> = {
  list: "care.read",
  get: "care.read",
  create: "care.write",
  request_approval: "care.write",
  approve_action: "care.approve",
  transition: "care.write",
  add_evidence: "care.write",
};

export function requiredCareCapability(action: unknown): string | null {
  if (typeof action !== "string" || !(action in REQUIRED_CAPABILITIES)) return null;
  return REQUIRED_CAPABILITIES[action as CareAction];
}

export function hasCareActionCapability(capabilities: unknown, action: unknown): boolean {
  const required = requiredCareCapability(action);
  return required !== null && Array.isArray(capabilities) && capabilities.includes(required);
}

export function isUsablePersonalToken(
  record: unknown,
  nowMs = Date.now(),
): boolean {
  if (!record || typeof record !== "object") return false;
  const token = record as { revoked_at?: unknown; expires_at?: unknown };
  if (token.revoked_at) return false;
  if (token.expires_at !== null && token.expires_at !== undefined) {
    if (typeof token.expires_at !== "string") return false;
    const expiry = Date.parse(token.expires_at);
    if (!Number.isFinite(expiry) || expiry <= nowMs) return false;
  }
  return true;
}
