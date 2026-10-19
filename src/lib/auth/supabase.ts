import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

/**
 * Supabase client bound to the request's cookies, for Auth only. Kraken never
 * reads or writes application tables through PostgREST -- every table has RLS
 * on with no policies, so this client can see nothing but its own session.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only. The
          // proxy refresh path is what actually persists rotated tokens.
        }
      },
    },
  });
}
