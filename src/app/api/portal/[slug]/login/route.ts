import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { clientIp, parseBody, publicHandler } from "@/lib/api/handler";
import { portalLoginInput } from "@/lib/api/schemas";
import { appendAudit } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { portalCookieOptions, signPortalSession } from "@/lib/auth/portal-session";
import {
  PORTAL_LOCKOUT,
  countRecentPortalLoginFailures,
  findProjectForLogin,
  recordPortalLoginAttempt,
} from "@/lib/data/portal";
import { tooManyRequests, unauthorized } from "@/lib/errors";

/**
 * An argon2id digest of a value nobody holds, derived once at first use with
 * the same cost parameters as a real password. When the slug does not resolve
 * we still run a full verification against it, so a nonexistent project costs
 * the same as a wrong password and the endpoint cannot be used to enumerate
 * which portals exist. Deriving it (rather than hardcoding a literal) means it
 * cannot silently rot into a malformed hash that fails fast.
 */
let decoyHash: Promise<string> | null = null;
function decoy(): Promise<string> {
  decoyHash ??= hashPassword(`decoy-${randomUUID()}`);
  return decoyHash;
}

export const POST = publicHandler<{ slug: string }>(async ({ request, params }) => {
  const { password } = await parseBody(request, portalLoginInput);
  const project = await findProjectForLogin(params.slug);
  // Vercel overwrites x-forwarded-for with the real client IP, so a caller cannot spoof it here.
  const ip = clientIp(request);
  const userAgent = request.headers.get("user-agent");

  // Checked before the password, so a locked-out caller cannot learn whether a
  // guess was right. Keyed by (slug, ip), not project, so a nonexistent slug
  // locks exactly like a real one. The refusal is recorded as a failure.
  if ((await countRecentPortalLoginFailures({ slug: params.slug, ip })) >= PORTAL_LOCKOUT.failures) {
    await recordPortalLoginAttempt({
      projectId: project?.id ?? null,
      slug: params.slug,
      ip,
      userAgent,
      success: false,
    });
    throw tooManyRequests("Too many attempts. Try again in a few minutes.");
  }

  const ok = await verifyPassword(project?.portal_password_hash ?? (await decoy()), password);

  // Every attempt is recorded, successful or not.
  await recordPortalLoginAttempt({
    projectId: project?.id ?? null,
    slug: params.slug,
    ip,
    userAgent,
    success: Boolean(project) && ok,
  });

  if (!project || !ok) {
    throw unauthorized("That password was not accepted");
  }

  const token = await signPortalSession(project.id, project.portal_password_version);
  const response = NextResponse.json({ ok: true, slug: project.slug });
  response.cookies.set("kraken_portal", token, portalCookieOptions());

  await appendAudit({
    actorType: "portal",
    actorId: project.id,
    actorLabel: project.slug,
    projectId: project.id,
    action: "portal.login",
    entityType: "project",
    entityId: project.id,
    payload: { ip },
  });

  return response;
});
