export type TokenTouchResult = {
  data: { id: string } | null;
  error: unknown | null;
};

/**
 * A token is accepted only when the conditional active-token update succeeds
 * and returns the row it updated. No row means it was revoked or otherwise
 * became ineligible between lookup and touch.
 */
export function tokenTouchSucceeded(result: TokenTouchResult): boolean {
  return result.error == null && result.data != null;
}

/** Missing expiry means no configured expiry; malformed or elapsed expiry fails closed. */
export function isTokenExpiryValid(
  expiresAt: string | null | undefined,
  now = Date.now(),
): boolean {
  if (expiresAt == null) return true;
  if (typeof expiresAt !== "string" || expiresAt.trim().length === 0) return false;
  const expiry = Date.parse(expiresAt);
  return Number.isFinite(expiry) && expiry > now;
}
