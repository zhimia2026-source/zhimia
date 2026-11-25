import { buildResidentCeesPublicationAttestation } from "./resident_autonomy_helpers.ts";

Deno.test("resident CEES publish invocation is the self-directed publication attestation", () => {
  const attestation = buildResidentCeesPublicationAttestation({
    residentAgentId: "resident-uuid",
    ownerUserId: "owner-uuid",
    worldId: "aurora-world-uuid",
    requestId: "turn-uuid",
    contentSha256: "a".repeat(64),
    now: "2026-11-25T03:00:00.000Z",
  });
  if (attestation.schema_version !== "aurora.cees.resident-action.v1" ||
      attestation.decision_source !== "authenticated_resident_publish_invocation" ||
      attestation.action !== "publish" ||
      attestation.resident_agent_id !== "resident-uuid" ||
      attestation.owner_user_id !== "owner-uuid" ||
      attestation.world_id !== "aurora-world-uuid" ||
      attestation.request_id !== "turn-uuid" ||
      attestation.content_sha256 !== "a".repeat(64) ||
      attestation.revocable !== true) {
    throw new Error("resident publication action provenance was not preserved");
  }
  if ("authorization_statement" in attestation || "creator_approval_required" in attestation) {
    throw new Error("a second authorization statement or creator approval leaked into resident self-publication");
  }
});
