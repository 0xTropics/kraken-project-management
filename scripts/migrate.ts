/**
 * Applies every SQL file in supabase/migrations that has not run yet, in
 * filename order, each inside its own transaction, recording the checksum so a
 * silently edited migration is caught rather than skipped.
 *
 * Same runner for local Postgres and for a Supabase project: point
 * DATABASE_URL at whichever one you mean.
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import postgres from "postgres";

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

/**
 * Applies every pending migration on `sql` and returns how many ran. Refuses if
 * an applied file was edited. The test suite's global setup runs this too.
 */
export async function applyPending(
  sql: postgres.Sql,
  log: (text: string) => void = (text) => process.stdout.write(text),
): Promise<number> {
  await sql`
    create table if not exists kraken_migrations (
      name       text primary key,
      checksum   text not null,
      applied_at timestamptz not null default now()
    )
  `;

  const applied = new Map<string, string>(
    (
      await sql<{ name: string; checksum: string }[]>`
        select name, checksum from kraken_migrations
      `
    ).map((r) => [r.name, r.checksum]),
  );

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let ran = 0;
  for (const file of files) {
    const body = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    const checksum = createHash("sha256").update(body).digest("hex");
    const previous = applied.get(file);

    if (previous === checksum) continue;
    if (previous && previous !== checksum) {
      throw new Error(
        `Migration ${file} was edited after it ran (checksum changed). ` +
          `Add a new migration instead, or run \`npm run db:reset\` in development.`,
      );
    }

    log(`  applying ${file} ... `);
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`
        insert into kraken_migrations (name, checksum) values (${file}, ${checksum})
      `;
    });
    log("ok\n");
    ran += 1;
  }
  return ran;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  try {
    const ran = await applyPending(sql);
    console.log(ran === 0 ? "Database already up to date." : `Applied ${ran} migration(s).`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Only when run directly: global-setup imports applyPending.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error("\nMigration failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
