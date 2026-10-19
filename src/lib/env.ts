/**
 * Environment access, in one place, with the failure mode spelled out.
 *
 * Kraken runs in two configurations that differ only in where identity and
 * files live. The database, the API, and the portal behave identically in
 * both.
 *
 * `supabase` is the deployed product; `local` is the test and development
 * harness that lets the suite and the dev server run with no cloud project.
 * Local is not a deployment option, so anything gated on it is dead code in
 * production -- and anything gated on `supabase` has no test covering it.
 *
 *   KRAKEN_AUTH_MODE=supabase   Supabase Auth issues the internal session, and
 *                               KRAKEN_INTERNAL_USER_IDS decides who is let in.
 *                               The password lives in Supabase's auth.users;
 *                               internal_users.password_hash is unused here.
 *   KRAKEN_AUTH_MODE=local      Kraken verifies an argon2id password against
 *                               internal_users and signs its own cookie. For
 *                               development on a machine with no cloud project.
 *
 *   KRAKEN_STORAGE_MODE=supabase  Invoice PDFs live in a private Storage bucket.
 *   KRAKEN_STORAGE_MODE=local     Invoice PDFs live under .storage/, served
 *                                 through the same short-lived signed-URL API.
 */

export type AuthMode = "supabase" | "local";
export type StorageMode = "supabase" | "local";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export const env = {
  get authMode(): AuthMode {
    return process.env.KRAKEN_AUTH_MODE === "supabase" ? "supabase" : "local";
  },
  get storageMode(): StorageMode {
    return process.env.KRAKEN_STORAGE_MODE === "supabase" ? "supabase" : "local";
  },
  /**
   * Signs the portal cookie, the local internal session cookie, and signed file
   * URLs. Must be at least 32 bytes; generate with `openssl rand -base64 32`.
   */
  get sessionSecret(): Uint8Array {
    const secret = required("KRAKEN_SESSION_SECRET");
    if (secret.length < 32) {
      throw new Error("KRAKEN_SESSION_SECRET must be at least 32 characters");
    }
    return new TextEncoder().encode(secret);
  },
  /**
   * The app's public origin. Unlike every other value here it is *parsed*, not
   * just interpolated -- the portal logout redirect used to use it as a `new
   * URL` base -- so a malformed setting is a crash rather than a cosmetic bug.
   * A schemeless value does exactly that: `new URL` throws.
   *
   * Hence: empty or whitespace counts as unset (`??` alone does not catch `""`,
   * which is the easy one to miss), and a bare host has `https://` put back on
   * rather than being handed onward to throw somewhere further away.
   */
  get appUrl(): string {
    const raw = process.env.KRAKEN_APP_URL?.trim();
    if (!raw) return "http://localhost:3100";

    const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      throw new Error(
        `KRAKEN_APP_URL is not a usable URL: ${JSON.stringify(raw)}. ` +
          `Set it to an origin such as https://your-app.vercel.app`,
      );
    }
    return parsed.origin + parsed.pathname.replace(/\/$/, "");
  },
  get supabaseUrl(): string {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey(): string {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get supabaseServiceKey(): string {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  /**
   * Allow-list of Supabase user ids permitted into /app: one internal
   * user. Empty means nobody gets in, which is the safe default for a
   * misconfigured deploy.
   */
  get internalUserIds(): string[] {
    return (process.env.KRAKEN_INTERNAL_USER_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  },
  get storageBucket(): string {
    return process.env.KRAKEN_STORAGE_BUCKET ?? "invoices";
  },
  get localStorageDir(): string {
    return process.env.KRAKEN_LOCAL_STORAGE_DIR ?? ".storage";
  },
  get companyName(): string {
    return process.env.KRAKEN_COMPANY_NAME ?? "Fathom Software";
  },
  get companyEmail(): string {
    return process.env.KRAKEN_COMPANY_EMAIL ?? "";
  },
  get companyAddress(): string {
    return process.env.KRAKEN_COMPANY_ADDRESS ?? "";
  },
} as const;
