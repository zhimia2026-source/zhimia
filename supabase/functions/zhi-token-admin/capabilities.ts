/**
 * Default personal-token scopes for a newly created independent ZHI account.
 * The default set excludes memory access; private-memory scopes require an explicit admin grant.
 * tool.execute is allowlisted for explicit administrator assignment only; it is never a default scope.
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
  "tool.execute",
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
