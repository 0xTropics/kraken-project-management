import type { Sql } from "@/lib/db/client";

/** Every client the demo seed inserts, in insert order. */
export const SEED_CLIENT_NAMES: readonly string[] = [
  "Northwind Botanicals",
  "Meridian Freight",
  "Halcyon Studio",
  "Juniper Dental",
];

/**
 * `db:seed` truncates every table. A client the seed did not create means the
 * database holds real data, so refuse. The client's name is deliberately not
 * printed.
 */
export async function assertSeedable(db: Sql): Promise<void> {
  const names = [...SEED_CLIENT_NAMES];
  const [row] = await db<{ n: number }[]>`
    select count(*)::int as n from clients where name <> all(${names}::text[])
  `;
  if (!row) throw new Error("assertSeedable: count returned no row");
  if (row.n > 0) {
    throw new Error(
      `Refusing to seed: this database has ${row.n} client(s) the demo seed did not create. ` +
        "`npm run db:seed` wipes every table. To rebuild a development database, run `npm run db:reset`.",
    );
  }
}
