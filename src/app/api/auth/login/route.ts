import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { appendAudit } from "@/lib/audit";
import { publicHandler, parseBody } from "@/lib/api/handler";
import { unauthorized } from "@/lib/errors";
import {
  INTERNAL_COOKIE,
  internalCookieOptions,
  signLocalSession,
  verifyLocalCredentials,
} from "@/lib/auth/internal";
import type { InternalUser } from "@/lib/db/types";

const input = z.object({
  email: z.string().trim().min(1, "Enter your email").max(200),
  password: z.string().min(1, "Enter your password").max(200),
});

export const POST = publicHandler(async ({ request }) => {
  const { email, password } = await parseBody(request, input);

  if (env.authMode === "supabase") {
    const { createSupabaseServerClient } = await import("@/lib/auth/supabase");
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) throw unauthorized("Those credentials were not accepted");

    // A valid Supabase session is not by itself an internal session.
    if (!env.internalUserIds.includes(data.user.id)) {
      await supabase.auth.signOut();
      throw unauthorized("This account does not have access to Kraken");
    }
    await appendAudit({
      actorType: "user",
      actorLabel: data.user.email ?? null,
      action: "auth.login",
      payload: { mode: "supabase" },
    });
    return { ok: true };
  }

  const user = await verifyLocalCredentials(email, password);
  if (!user) throw unauthorized("Those credentials were not accepted");

  const token = await signLocalSession(user as InternalUser);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(INTERNAL_COOKIE, token, internalCookieOptions());

  await appendAudit({
    actorType: "user",
    actorId: user.id,
    actorLabel: user.email,
    action: "auth.login",
    payload: { mode: "local" },
  });
  return response;
});
