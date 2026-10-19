import postgres from "postgres";

/**
 * One Postgres client for the whole server. Works unchanged against a Supabase
 * pooled connection in production and against the credential-free local
 * Postgres (`npm run db:start`) in development, because both speak the same
 * wire protocol.
 *
 * Two driver defaults are deliberately overridden:
 *
 *  - `numeric` arrives as a JS string by default. Everything here is money or
 *    hours with at most two decimals, so parsing to a number is exact, and the
 *    invoice engine still does its arithmetic in integer cents.
 *  - `date` arrives as a `Date` in the server's zone, which silently shifts
 *    a time entry to the previous day for anyone west of UTC. Kraken treats a
 *    calendar date as a `YYYY-MM-DD` string end to end.
 *  - `timestamptz` arrives as a `Date`. A `Date` cannot cross the server/client
 *    boundary in a React payload without a hydration mismatch, and every row
 *    type in `db/types.ts` already declares these columns as strings. Parsing
 *    to an ISO string here makes the declared types true everywhere.
 */

const DATE_OID = 1082;
const NUMERIC_OID = 1700;
const TIMESTAMP_OID = 1114;
const TIMESTAMPTZ_OID = 1184;

export type Sql = postgres.Sql<{ bigint: bigint }>;

/**
 * Anything that can run a query: the pool itself, or a transaction handle from
 * `sql.begin`. Helpers that must work in both contexts take this.
 */
export type Db = postgres.Sql<{ bigint: bigint }> | postgres.TransactionSql<{ bigint: bigint }>;

function create(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local, then run `npm run db:start` for a local database.",
    );
  }

  return postgres(url, {
    // No pooler can cache prepared statements across connections, and neither
    // can a serverless function that may be recycled between calls.
    //
    // This flag is necessary but NOT sufficient: it does not make transaction
    // mode safe. Pages fan out up to six concurrent queries through
    // `Promise.all`, postgres.js pipelines them down one connection, and
    // transaction mode misroutes the results between queries. Kraken must run
    // on Supabase's *session* pooler.
    prepare: false,
    max: Number(process.env.DATABASE_POOL_MAX ?? 2),
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {},
    types: {
      date: {
        to: DATE_OID,
        from: [DATE_OID],
        serialize: (value: string | Date) =>
          typeof value === "string" ? value : value.toISOString().slice(0, 10),
        parse: (value: string) => value,
      },
      numeric: {
        to: NUMERIC_OID,
        from: [NUMERIC_OID],
        serialize: (value: number | string) => String(value),
        parse: (value: string) => Number(value),
      },
      timestamptz: {
        to: TIMESTAMPTZ_OID,
        from: [TIMESTAMPTZ_OID, TIMESTAMP_OID],
        serialize: (value: Date | string) =>
          value instanceof Date ? value.toISOString() : value,
        parse: (value: string) => new Date(value).toISOString(),
      },
    },
  }) as unknown as Sql;
}

declare global {
  var __krakenSql: Sql | undefined;
}

/**
 * One pool per process, in every environment. Next.js compiles this module
 * once per bundle layer -- the route handlers get one copy, the server
 * components another -- so without the global a single production instance
 * runs two pools of `max` each. Against Supabase's session-mode pooler every
 * connection is a Postgres backend and the cap is the project's Pool Size, so
 * instances x `DATABASE_POOL_MAX` must stay well under it. Past the cap the
 * pooler refuses the next connection with `EMAXCONNSESSION`, which a prefetch
 * burst of concurrent page renders can trigger. The cap is a dashboard setting,
 * not something in the repository, so check it there.
 * The dev-only guard this replaced was written for HMR; it was never the only
 * reason a process re-evaluates this module.
 */
export const sql: Sql = globalThis.__krakenSql ?? create();
globalThis.__krakenSql = sql;
