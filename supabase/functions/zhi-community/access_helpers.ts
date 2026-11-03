export type MembershipAuthorizationRecord = {
  principal_user_id: string;
  status: string;
  revoked_at: string | null;
  agent_id: string | null;
  expires_at: string | null;
  capabilities: string[] | null;
};

/** Defense-in-depth check for a user-scoped scene membership. */
export function isMembershipAuthorized(
  membership: MembershipAuthorizationRecord | null | undefined,
  actorUserId: string,
  capability: string,
  now = Date.now(),
): boolean {
  if (!membership || !actorUserId || membership.principal_user_id !== actorUserId) return false;
  if (membership.status !== "active" || membership.revoked_at !== null || membership.agent_id !== null) return false;
  if (membership.expires_at) {
    const expiry = Date.parse(membership.expires_at);
    if (!Number.isFinite(expiry) || expiry <= now) return false;
  }
  if (!Array.isArray(membership.capabilities) || !membership.capabilities.includes(capability)) return false;
  return true;
}

export type RejoinPrivileges = {
  membership_role: "owner" | "member";
  capabilities: string[];
};

/**
 * Public-scene rejoining must not resurrect moderator privileges after revocation
 * or expiry. Only the original owner role is retained; all other actors rejoin
 * with ordinary messaging capabilities.
 */
export function privilegesForPublicRejoin(
  existingRole: string,
  existingCapabilities: string[] | null,
): RejoinPrivileges {
  if (existingRole === "owner") {
    return {
      membership_role: "owner",
      capabilities: Array.isArray(existingCapabilities) ? [...existingCapabilities] : [],
    };
  }
  return {
    membership_role: "member",
    capabilities: ["message:send", "message:read"],
  };
}


/** Agent membership is bound to both its responsible owner and exact agent actor. */
export function isAgentMembershipAuthorized(
  membership: MembershipAuthorizationRecord | null | undefined,
  ownerUserId: string,
  agentId: string,
  capability: string,
  now = Date.now(),
): boolean {
  if (!membership || !ownerUserId || !agentId) return false;
  if (membership.principal_user_id !== ownerUserId || membership.agent_id !== agentId) return false;
  if (membership.status !== "active" || membership.revoked_at !== null) return false;
  if (membership.expires_at) {
    const expiry = Date.parse(membership.expires_at);
    if (!Number.isFinite(expiry) || expiry <= now) return false;
  }
  return Array.isArray(membership.capabilities) && membership.capabilities.includes(capability);
}
