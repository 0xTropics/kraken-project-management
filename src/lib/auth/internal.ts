import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { sql } from "@/lib/db/client";
import { env } from "@/lib/env";
import { unauthorized } from "@/lib/errors";
import type { InternalUser } from "@/lib/db/types";
import { verifyPassword } from "./password";

export const INTERNAL_COOKIE = "kraken_session";
const LOCAL_SESSION_DAYS = 14;

export interface InternalSession {
  userId: string;
  email: string;
  name: string | null;
}

/* -------------------------------------------------------------------------- */
/* Local mode                                                                  */
/* -------------------------------------------------------------------------- */

export async function signLocalSession(user: InternalUser): Promise<string> {
  return new SignJWT({ email: user.email, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setIssuer("kraken")
    .setAudience("kraken-internal")
    .setExpirationTime(`${LOCAL_SESSION_DAYS}d`)
    .sign(env.sessionSecret);
}

/** Also called by the proxy, which reads the cookie off the request itself. */
export async function readLocalSession(token: string): Promise<InternalSession | null> {
  try {
    const { payload } = await jwtVerify(token, env.sessionSecret, {
      issuer: "kraken",
      audience: "kraken-internal",
    });
    if (!payload.sub) return null;
    // The cookie is a claim, not a fact: confirm the operator still exists.
    const [user] = await sql<Pick<InternalUser, "id" | "email" | "name">[]>`
      select id, email, name from internal_users where id = ${payload.sub}
    `;
    if (!user) return null;
    return { userId: user.id, email: user.email, name: user.name };
  } catch {
    return null;
  }
}

export async function verifyLocalCredentials(
  email: string,
  password: string,
): Promise<InternalUser | null> {
  const [user] = await sql<InternalUser[]>`
    select * from internal_users where lower(email) = lower(${email})
  `;
  if (!user?.password_hash) return null;
  return (await verifyPassword(user.password_hash, password)) ? user : null;
}

/* -------------------------------------------------------------------------- */
/* Supabase mode                                                               */
/* -------------------------------------------------------------------------- */

async function readSupabaseSession(): Promise<InternalSession | null> {
  const { createSupabaseServerClient } = await import("./supabase");
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // A single allow-listed user id reaches the internal app. A valid
  // Supabase session for anyone else is not an internal session.
  const allowed = env.internalUserIds;
  if (allowed.length === 0 || !allowed.includes(user.id)) return null;

  // Mirror the Supabase identity into internal_users so audit rows carry a
  // stable local actor id in both modes.
  const [row] = await sql<Pick<InternalUser, "id" | "email" | "name">[]>`
    insert into internal_users (email, name, supabase_uid)
    values (${user.email ?? ""}, ${(user.user_metadata?.name as string | undefined) ?? null}, ${user.id})
    on conflict (supabase_uid) do update set email = excluded.email
    returning id, email, name
  `;
  if (!row) throw new Error("readSupabaseSession: internal_users upsert returned no row");
  return { userId: row.id, email: row.email, name: row.name };
}

/* -------------------------------------------------------------------------- */
/* Entry points                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Memoized per render pass, so a layout, its page, and generateMetadata share
 * one lookup. Route handlers are not a render pass: there it runs every call.
 */
export const getInternalSession = cache(async (): Promise<InternalSession | null> => {
  if (env.authMode === "supabase") return readSupabaseSession();
  const token = (await cookies()).get(INTERNAL_COOKIE)?.value;
  return token ? readLocalSession(token) : null;
});

/** Every internal API route goes through this. Throws 401 when absent. */
export async function requireInternalSession(): Promise<InternalSession> {
  const session = await getInternalSession();
  if (!session) throw unauthorized("Sign in to continue");
  return session;
}

/**
 * Every internal page, layout, and generateMetadata calls this first. A
 * layout's check does not stop the page beneath it: the router renders each
 * segment on its own, so an unchecked page still lands in the RSC payload.
 */
export async function requireInternalPage(next?: string): Promise<InternalSession> {
  const session = await getInternalSession();
  if (!session) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return session;
}

export function internalCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: LOCAL_SESSION_DAYS * 24 * 60 * 60,
  };
}
