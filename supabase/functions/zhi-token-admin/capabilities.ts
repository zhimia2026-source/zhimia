/**
 * Default personal-token scopes for a newly created independent ZHI account.
 * Deliberately excludes world creation/invitation, memory access, and tool execution.
 */
export const DEFAULT_PERSONAL_TOKEN_CAPABILITIES = Object.freeze([
  "health.chat",
  "health.history.read",
  "health.consent.manage",
  "community.scene.discover",
  "community.scene.enter",
  "community.agent.create",
  "community.message.read",
  "community.message.send",
  "agent.audit.read",
] as const);
