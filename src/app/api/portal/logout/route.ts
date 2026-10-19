import { NextResponse } from "next/server";
import { publicHandler } from "@/lib/api/handler";
import { PORTAL_COOKIE } from "@/lib/auth/portal-session";
import { portalScopeFromRequest } from "@/lib/data/portal";
import { sql } from "@/lib/db/client";

/**
 * Signing out is the last thing a client does here, and it is a plain form
 * post: no JavaScript is involved, so the response has to be a redirect. A JSON
 * body would leave the browser sitting on `{"ok":true}` with no way back --
 * four seconds that turn a tidy portal into a broken website.
 *
 * The slug is resolved from the cookie *before* it is cleared, so the client
 * lands back on their own login screen rather than a generic page.
 *
 * The destination is built from the request, not from `env.appUrl`. That
 * variable can be schemeless, in which case `new URL` throws and this route
 * would return a 500 *before* reaching the line below that clears the
 * cookie -- so the client could not sign out, and was signed straight back in
 * on their next visit. The request already carries the origin the browser is
 * on, which is also correct on preview deployments and custom domains, where
 * one environment variable cannot be right for every origin.
 */
export const POST = publicHandler(async ({ request }) => {
  const scope = await portalScopeFromRequest(request);

  let slug: string | null = null;
  if (scope) {
    const [project] = await sql<{ slug: string }[]>`
      select slug from projects where id = ${scope.projectId}
    `;
    slug = project?.slug ?? null;
  }

  const destination = new URL(slug ? `/portal/${slug}?signed-out=1` : "/", request.url);

  // 303 so the browser follows with GET rather than replaying the POST.
  const response = NextResponse.redirect(destination, 303);
  response.cookies.set(PORTAL_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
});
