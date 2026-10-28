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
  if (membership.expires_at && Date.parse(membership.expires_at) <= now) return false;
  if (!Array.isArray(membership.capabilities) || !membership.capabilities.includes(capability)) return false;
  return true;
}
