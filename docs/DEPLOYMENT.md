# Deploying Kraken

Kraken deploys to Vercel with Supabase for Postgres, Auth, and Storage. Every
step below needs credentials that only you have, so they are written to be run
once, by hand, in order.

Kraken needs Node 22.13 through 24.x (`.nvmrc` pins 24). Vercel reads
`engines.node` from `package.json`, which overrides the project's Node.js
Version setting, so there is nothing to configure.

## 1. Create the Supabase project

1. https://supabase.com/dashboard → **New project**. Pick a region near you.
2. Save the database password it generates.
3. From **Project Settings → API**, copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` secret → `SUPABASE_SERVICE_ROLE_KEY` (server-only, never public)
4. From **Connect → Session pooler**, copy the URI → `DATABASE_URL`. It looks
   like:
   ```
   postgres://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```
   Use the **session pooler** (port 5432), not the transaction pooler (port
   6543) and not the direct connection.

   This is not a preference. postgres.js pipelines the concurrent queries these
   pages fire (`Promise.all`, up to six per page), and transaction mode
   misroutes the results between them, so queries return each other's rows.
   `prepare: false` is necessary for any pooler and is **not sufficient** to
   make transaction mode safe.

   The session pooler caps connections at the project's **Pool Size**. Every
   Vercel instance holds its own pool, so instances × `DATABASE_POOL_MAX` must
   stay well under it — see the `DATABASE_POOL_MAX` note in §5.

## 2. Apply the migrations

From a checkout of this repository (`npm ci` first) and a machine with the
connection string:

```bash
DATABASE_URL='postgres://postgres.<ref>:<password>@...pooler.supabase.com:5432/postgres' \
  npm run db:migrate
```

The runner is idempotent, tracks what it has applied in `kraken_migrations`, and
refuses to run a migration whose contents changed after it was applied. Migrations
are append-only: a fix is a new file, never an edit.

Use this runner for every migration. The files in `supabase/migrations/` follow
the Supabase CLI's naming convention, but `supabase db push` and `db:migrate`
each record their history in their own table, so either runner re-applies
everything after the other.

**On an update** (as opposed to a first deploy against an empty database),
this order is only safe for additive migrations. `db:migrate` applies every
pending file with no way to stop partway through, so if a pending migration
drops or renames a column the previous build still reads, running it here —
before §5 — serves 500s off the old build until Vercel finishes deploying.
Read the pending files before you run them. A migration that removes something
the running build uses must be applied *after* the new build is live, which
means holding that file back until then.

## 3. Create the Storage bucket

Supabase dashboard → **Storage** → **New bucket**:

- Name: `invoices` (or any name, if you set `KRAKEN_STORAGE_BUCKET` to match)
- **Private** (public must be off — invoice PDFs are handed out through
  short-lived signed URLs, never a durable public link)

No bucket policies are needed: Kraken reaches Storage with the service role key
from the server only.

## 4. Create the internal user

Supabase dashboard → **Authentication → Users → Add user**. Use your own email
and a strong password, and tick "auto confirm". This is the supported route and
the one to prefer.

Copy the new user's UUID into `KRAKEN_INTERNAL_USER_IDS` (comma-separated for
more than one). This is an allow-list: a valid Supabase session for any other
user is not an internal session, and an empty list lets nobody in.

Then turn off public sign-up: **Authentication → Sign In / Providers → Allow
new users to sign up** → off. Kraken never needs it, because the operator
account is the one you just created by hand. Left on, anyone can create a
Supabase account in your project. The allow-list still refuses them at the
proxy and on every page, but it is defence in depth, not a reason to leave
sign-up open.

**Two things that are easy to get wrong here:**

- The operator password lives in Supabase's `auth.users`. A deployed Kraken
  never reads `internal_users.password_hash` — that column belongs to the local
  development harness. Changing it changes nothing in production.
- The allow-list is an environment variable, so **adding or changing an
  operator needs a Vercel redeploy**, not just a database write. Creating the
  Supabase user is only half the job; until its uuid is in
  `KRAKEN_INTERNAL_USER_IDS`, that user signs in to Supabase successfully and
  is then refused by Kraken with "This account does not have access".

### Doing it in SQL instead

If you would rather run SQL than use the dashboard, the insert has to create
an `auth.identities` row as well as the `auth.users` row — GoTrue refuses to
authenticate a password against a user with no email identity, so a users-only
insert produces "Invalid login credentials" with a perfectly correct hash.
That is why the dashboard route is the one to prefer; a SQL script also holds
a plaintext password, so keep it out of version control.

## 5. Deploy to Vercel

```bash
npm i -g vercel
vercel link
```

Set the environment variables (Production, plus Preview if you deploy
previews):

```bash
vercel env add DATABASE_URL
vercel env add DATABASE_POOL_MAX            # 2 -- see the note below
vercel env add KRAKEN_SESSION_SECRET        # openssl rand -base64 48
vercel env add KRAKEN_APP_URL               # https://your-domain
vercel env add KRAKEN_AUTH_MODE             # supabase
vercel env add KRAKEN_STORAGE_MODE          # supabase
vercel env add KRAKEN_INTERNAL_USER_IDS
vercel env add KRAKEN_STORAGE_BUCKET        # invoices
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add KRAKEN_COMPANY_NAME
vercel env add KRAKEN_COMPANY_EMAIL
vercel env add KRAKEN_COMPANY_ADDRESS

vercel --prod
```

`vercel.json` turns off automatic deploys for every branch except `main`, so a
push to `main` deploys to production once the Vercel project is connected to
your Git repository. Remove that file if you want preview deploys.

`KRAKEN_SESSION_SECRET` signs portal cookies and file URLs. Rotating it logs
every client out and invalidates outstanding download links — which is also how
you revoke them in a hurry.

`DATABASE_POOL_MAX` is per Vercel instance, and Vercel runs several instances
under a burst (navigation prefetch renders many pages at once). In session mode
the pooler holds one Postgres backend per connection and refuses the next one
past the project's **Pool Size** (Supabase → Settings → Database → Connection
pooling) with `EMAXCONNSESSION`. Keep this at 2: the six-way fan-outs pipeline
fine on two connections for a single operator, and Pool Size ÷ 2 is a ceiling
on concurrent instances, not a target — a Pool Size of 15 tops out at seven, 30
at fifteen. Raising Pool Size buys headroom too, but every backend it allows is
a slot taken from `max_connections`.

## 6. Add your first data

Do **not** run `npm run db:seed` or `npm run db:reset` against a deployed
database: both wipe every data table and load demo data. They read
`.env.local`, so keep production credentials out of that file. Create your
first client and project in the app instead; creating a project sets its portal
password, and the project's settings page rotates it.

## Operational notes

- **Runtime.** Every route runs on the Node runtime; the Postgres driver and the
  argon2 binding are not Edge-compatible. `serverExternalPackages` in
  `next.config.ts` keeps them out of the bundle.
- **Backups.** Supabase takes daily backups on paid plans. Invoices are the data
  you cannot reconstruct — check that backups are on before issuing the first
  one.
- **Rotating a portal password** bumps `portal_password_version`, which
  invalidates that project's live sessions immediately.

## Not built

General rate limiting and IP allow-listing. Two portal paths are throttled.

- **Login.** 10 failed attempts from one IP against one portal within 15
  minutes lock that pair out. Further attempts get a 429, even with the right
  password. Refused attempts are recorded as failures too, so a client who keeps
  retrying stays locked out until they stop for 15 minutes. Every portal login
  attempt, successful or not, is recorded in `portal_login_attempts`.
- **Requests.** A project accepts at most 10 client requests per day. The 11th
  gets a 429 until older ones fall outside the last 24 hours.
