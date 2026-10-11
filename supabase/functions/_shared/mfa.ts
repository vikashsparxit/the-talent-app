// Pure MFA assurance checks. No Deno APIs or remote imports here,
// so the vitest suite (src/test/mfa.test.ts) can import it directly.

export interface MfaFactor {
  status?: string;
}

/**
 * Read the `aal` claim from a JWT without verifying it.
 * Only call this on a token GoTrue has already validated (auth.getUser).
 */
export function tokenAssuranceLevel(token: string): string | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const claims = JSON.parse(atob(padded)) as { aal?: unknown };
    return typeof claims.aal === "string" ? claims.aal : null;
  } catch {
    return null;
  }
}

/**
 * A session satisfies MFA when it is aal2, or when the user has no verified
 * factor to step up with. Mirrors public.mfa_satisfied() in the database.
 */
export function mfaSatisfied(
  aal: string | null,
  factors: readonly MfaFactor[] | null | undefined,
): boolean {
  if (aal === "aal2") return true;
  return !(factors ?? []).some((factor) => factor.status === "verified");
}
