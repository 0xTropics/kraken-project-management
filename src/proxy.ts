import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

/**
 * Turns away requests for /app that carry no internal session before a page
 * renders, and keeps the Supabase session cookie fresh when Supabase Auth is in
 * use. It applies the same rule as `getInternalSession()`: in supabase mode the
 * user must be on the allow-list, in local mode the cookie must verify.
 *
 * This is a first filter, NOT the security boundary. Every page, layout, and
 * generateMetadata calls `requireInternalPage()` and every route handler calls
 * `requireInternalSession()`, because a proxy can be skipped or misconfigured.
 */
const INTERNAL_COOKIE = "kraken_session";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (process.env.KRAKEN_AUTH_MODE === "supabase") {
    const { createServerClient } = await import("@supabase/ssr");
    const response = NextResponse.next({ request });
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (toSet) => {
            for (const { name, value, options } of toSet) {
              response.cookies.set(name, value, options);
            }
          },
        },
      },
    );
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // A Supabase session alone is not enough: same allow-list as readSupabaseSession().
    const allowed = !!user && env.internalUserIds.includes(user.id);
    if (!allowed && pathname.startsWith("/app")) {
      return NextResponse.redirect(signInUrl(request));
    }
    return response;
  }

  // Imported here so the supabase path never loads the database client.
  const { readLocalSession } = await import("@/lib/auth/internal");
  const token = request.cookies.get(INTERNAL_COOKIE)?.value;
  if (pathname.startsWith("/app") && !(token && (await readLocalSession(token)))) {
    return NextResponse.redirect(signInUrl(request));
  }
  return NextResponse.next();
}

function signInUrl(request: NextRequest): URL {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(request.nextUrl.pathname)}`;
  return url;
}

export const config = {
  matcher: ["/app/:path*"],
};
