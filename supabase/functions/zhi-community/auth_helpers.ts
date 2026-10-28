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
