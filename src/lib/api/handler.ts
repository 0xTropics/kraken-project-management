import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { ApiError, badRequest, forbidden } from "@/lib/errors";
import { requireInternalSession, type InternalSession } from "@/lib/auth/internal";

export interface InternalContext<P = Record<string, string>> {
  request: Request;
  session: InternalSession;
  params: P;
  searchParams: URLSearchParams;
}

type RouteArgs<P> = { params: Promise<P> } | undefined;

function toResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.message, code: error.code ?? null },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Some fields need attention",
        code: "validation_failed",
        issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 422 },
    );
  }
  // Postgres guard triggers surface as bare messages; map the ones a user can
  // actually cause onto a 409 rather than a 500.
  const message = error instanceof Error ? error.message : String(error);
  const guard: Record<string, string> = {
    invoice_immutable: "This invoice is finalized and cannot be changed. Void and reissue instead.",
    invoice_void_is_terminal: "A void invoice cannot be reopened.",
    invoice_cannot_return_to_draft: "A finalized invoice cannot go back to draft.",
    time_entry_locked: "This time entry is on a finalized invoice and is read-only.",
    audit_log_is_append_only: "The audit log cannot be modified.",
    // Raised by invoice_lines_guard_charge_once() when a second live line
    // targets the same charge_id. The charges DELETE route also throws its
    // own ApiError with this code (handled above, before we get here) for
    // the pre-checked case; this entry is the backstop for the trigger firing
    // directly -- e.g. two concurrent inserts racing past the route's check.
    charge_already_billed: "This charge is already on a live invoice. Void that invoice to rebill it.",
  };
  if (guard[message]) {
    return NextResponse.json({ error: guard[message], code: message }, { status: 409 });
  }
  if (message.includes("duplicate key")) {
    return NextResponse.json(
      { error: "That value is already taken.", code: "conflict" },
      { status: 409 },
    );
  }
  // Backstop for a raw foreign-key violation (e.g. `on delete restrict`)
  // reaching a route with no pre-check of its own, or a pre-check with a gap:
  // a 409 with a generic-but-honest message beats a 500 that reads as a bug.
  // Route-specific pre-checks (like the charges DELETE route's) should still
  // fire first and produce a better message; this only catches what they miss.
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "23503"
  ) {
    return NextResponse.json(
      {
        error: "This can't be deleted because something else still refers to it.",
        code: "foreign_key_violation",
      },
      { status: 409 },
    );
  }

  console.error("[kraken] unhandled route error:", error);
  return NextResponse.json(
    { error: "Something went wrong on our end.", code: "internal_error" },
    { status: 500 },
  );
}

/** Public route wrapper: error shaping and 204 for an empty result, no session requirement. */
export function publicHandler<P = Record<string, string>>(
  handler: (ctx: Omit<InternalContext<P>, "session">) => Promise<unknown>,
) {
  return async (request: Request, args: RouteArgs<P>): Promise<NextResponse> => {
    try {
      const params = ((await args?.params) ?? {}) as P;
      const result = await handler({
        request,
        params,
        searchParams: new URL(request.url).searchParams,
      });
      if (result instanceof NextResponse) return result;
      if (result === undefined || result === null) return new NextResponse(null, { status: 204 });
      return NextResponse.json(result);
    } catch (error) {
      return toResponse(error);
    }
  };
}

/**
 * Wraps an internal API route. Authentication happens here, once, before the
 * handler body runs, so a route cannot forget it. The internal session
 * is the only credential that reaches these routes -- a portal cookie is simply
 * absent from this path.
 */
export function internalHandler<P = Record<string, string>>(
  handler: (ctx: InternalContext<P>) => Promise<unknown>,
) {
  return publicHandler<P>(async (ctx) =>
    handler({ ...ctx, session: await requireInternalSession() }),
  );
}

export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw badRequest("Expected a JSON body");
  }
  return schema.parse(raw);
}

/**
 * Defence in depth for the portal's one write path, on top of the SameSite=Lax
 * cookie: a browser always sends Origin on a cross-site POST, and it must be us.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    throw forbidden("Cross-site request refused");
  }
}

/** Best-effort client IP, for the portal login log. */
export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip");
}
