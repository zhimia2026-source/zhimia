export type ResidentPublicWorldMessageAction = {
  world_public: true;
  message: string;
};

/**
 * Build an explicit public-world action from a resident-authored message.
 * Public messages deliberately carry no recipient identity.
 */
export function buildResidentPublicWorldMessageAction(
  value: unknown,
): ResidentPublicWorldMessageAction | null {
  if (typeof value !== "string") return null;
  const message = value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
  if (message.length < 1 || message.length > 8000) return null;
  return { world_public: true, message };
}
