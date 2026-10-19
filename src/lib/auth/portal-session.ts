import { SignJWT } from "jose";
import { env } from "@/lib/env";

export const PORTAL_COOKIE = "kraken_portal";
const PORTAL_SESSION_DAYS = 30;

/**
 * The portal session. `pv` is the project's `portal_password_version`: rotating
 * the password bumps that column, which invalidates every cookie already out
 * there without any server-side session store.
 */
export async function signPortalSession(
  projectId: string,
  passwordVersion: number,
): Promise<string> {
  return new SignJWT({ pv: passwordVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(projectId)
    .setIssuedAt()
    .setIssuer("kraken")
    .setAudience("kraken-portal")
    .setExpirationTime(`${PORTAL_SESSION_DAYS}d`)
    .sign(env.sessionSecret);
}

export function portalCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PORTAL_SESSION_DAYS * 24 * 60 * 60,
  };
}
