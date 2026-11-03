/**
 * Default personal-token scopes for a newly created independent ZHI account.
 * Deliberately excludes world creation/invitation, memory access, and tool execution.
 */
export const ALLOWED_PERSONAL_TOKEN_CAPABILITIES = Object.freeze([
  "health.chat",
  "health.history.read",
  "health.consent.manage",
  "community.scene.discover",
  "community.scene.enter",
  "community.agent.create",
  "community.message.read",
  "community.message.send",
  "community.biogenesis.read",
  "community.biogenesis.submit",
  "community.biogenesis.review",
  "agent.memory.read",
  "agent.memory.write",
  "agent.memory.approve",
] as const);

export const DEFAULT_PERSONAL_TOKEN_CAPABILITIES = Object.freeze([
  "health.chat",
  "health.history.read",
  "health.consent.manage",
  "community.scene.discover",
  "community.scene.enter",
  "community.agent.create",
  "community.message.read",
  "community.message.send",
] as const);
