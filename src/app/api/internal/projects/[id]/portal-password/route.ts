import { internalHandler, parseBody } from "@/lib/api/handler";
import { rotatePortalPasswordInput } from "@/lib/api/schemas";
import { appendAudit, userActor } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";
import { sql } from "@/lib/db/client";
import { notFound } from "@/lib/errors";

type Params = { id: string };

/**
 * Rotate the portal password.
 *
 * Bumping `portal_password_version` is the part that matters: every live portal
 * cookie carries the version it was issued under, and `portalScopeFromToken`
 * re-checks it against the row, so incrementing here signs every existing
 * session out. The new plaintext is hashed and then dropped; it is returned to
 * nobody and `appendAudit` redacts the key even if a future caller passes it.
 */
export const POST = internalHandler<Params>(async ({ request, params, session }) => {
  const { portal_password } = await parseBody(request, rotatePortalPasswordInput);
  const digest = await hashPassword(portal_password);

  const [row] = await sql<{ id: string; slug: string; portal_password_version: number }[]>`
    update projects
    set portal_password_hash = ${digest},
        portal_password_version = portal_password_version + 1
    where id = ${params.id}
    returning id, slug, portal_password_version
  `;
  if (!row) throw notFound("That project no longer exists");

  await appendAudit({
    ...userActor(session),
    projectId: row.id,
    action: "project.rotate_portal_password",
    entityType: "project",
    entityId: row.id,
    payload: { portal_password_version: row.portal_password_version },
  });

  return {
    slug: row.slug,
    portal_password_version: row.portal_password_version,
    sessions_invalidated: true,
  };
});
