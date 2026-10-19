/**
 * What the portal login form says for a refused login. Pure so the wording is
 * testable without a DOM. Only a 401 means "wrong password": a lockout or a
 * server fault must not tell the client to re-check a password that may be right.
 */
export function portalLoginErrorMessage(status: number, body: { error?: unknown } | null): string {
  if (status === 429) {
    return typeof body?.error === "string" && body.error.trim() !== ""
      ? body.error
      : "Too many attempts. Try again in a few minutes.";
  }
  if (status === 401) return "That password was not accepted. Check it and try again.";
  return "Something went wrong. Try again in a moment.";
}
