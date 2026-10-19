import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { publicHandler } from "@/lib/api/handler";
import { INTERNAL_COOKIE } from "@/lib/auth/internal";

export const POST = publicHandler(async () => {
  if (env.authMode === "supabase") {
    const { createSupabaseServerClient } = await import("@/lib/auth/supabase");
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(INTERNAL_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
});
