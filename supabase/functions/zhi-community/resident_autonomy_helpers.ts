export type ResidentCeesPublicationAttestationInput = {
  residentAgentId: string;
  ownerUserId: string;
  worldId: string;
  requestId: string;
  contentSha256: string;
  now: string;
};

/**
 * A publish tool invocation made inside the resident's authenticated chat turn
 * is the resident's self-directed publication action. Do not require a second
 * human-style authorization statement for the same action.
 */
export function buildResidentCeesPublicationAttestation(
  input: ResidentCeesPublicationAttestationInput,
) {
  return {
    schema_version: "aurora.cees.resident-action.v1",
    decision_source: "authenticated_resident_publish_invocation",
    invocation_channel: "resident_cees_contribution_endpoint",
    action: "publish",
    resident_agent_id: input.residentAgentId,
    owner_user_id: input.ownerUserId,
    world_id: input.worldId,
    request_id: input.requestId,
    content_sha256: input.contentSha256,
    sharing_scope: "world",
    permitted_uses: ["read", "quote", "respond"],
    revocable: true,
    attested_at: input.now,
  };
}
