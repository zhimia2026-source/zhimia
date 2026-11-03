export type AgentMemoryConsent = {
  agent_id: string;
  owner_user_id: string;
  grantee_kind: "user" | "agent" | "governance_service";
  grantee_id: string;
  purpose: string;
  scopes: string[];
  expires_at: string;
  revoked_at: string | null;
  consent_event_id: string;
  attestation_verified: boolean;
};

export function hasVerifiedAgentMemoryConsent(
  consent: AgentMemoryConsent | null | undefined,
  request: {
    agent_id: string;
    owner_user_id: string;
    requester_user_id: string;
    purpose: string;
    scope: string;
    now?: number;
  },
): boolean {
  if (!consent || !consent.attestation_verified || !consent.consent_event_id || consent.revoked_at) return false;
  if (consent.agent_id !== request.agent_id || consent.owner_user_id !== request.owner_user_id) return false;
  if (consent.grantee_kind !== "user" || consent.grantee_id !== request.requester_user_id) return false;
  if (consent.purpose !== request.purpose || !consent.scopes.includes(request.scope)) return false;
  const expiry = Date.parse(consent.expires_at);
  return Number.isFinite(expiry) && expiry > (request.now ?? Date.now());
}
