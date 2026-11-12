# Deploying Kraken

Kraken runs in one of two supported ways: on Vercel with Supabase for
Postgres, Auth, and Storage (§1 to §6), or on a single machine you own, with a
local Postgres, local password auth and local file storage (see
[Self-hosting on one machine](#self-hosting-on-one-machine)). Every step below
needs credentials that only you have, so they are written to be run once, by
hand, in order.

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
  never reads `internal_users.password_hash` — that column belongs to local
  mode. Changing it changes nothing on a Supabase deployment.
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

## Self-hosting on one machine

This is the second supported deployment: one machine runs Postgres and Kraken,
with `KRAKEN_AUTH_MODE=local` and `KRAKEN_STORAGE_MODE=local`. The scripts in
`scripts/selfhost/` assume macOS with launchd; the layout and the variables
carry over to any machine with a service manager, but `deploy.sh` calls
`launchctl` directly.

**It is for a private network.** Local mode has no operator login throttling
(only the portal is throttled, see "Not built") and is not hardened for the
public internet. Putting a public reverse proxy in front of it is unsupported.
Reach it over a VPN or a LAN.

### Requirements

- Node 22.13 through 24.x, `git`, and Postgres with `pg_dump` and `pg_restore`
  on the same machine, listening on localhost.
- Postgres in UTC. The app runs with `TZ=UTC`, and some queries cast
  timestamps to dates in the database's own time zone (revenue is bucketed on
  `finalized_at::date`), so a database in another zone can put a date on the
  wrong side of midnight. Set `timezone = 'UTC'` in `postgresql.conf`, or
  `alter database kraken set timezone to 'UTC'`.
- HTTPS in front of the app. The operator session cookie is `secure` whenever
  `NODE_ENV=production`, which `start.sh` sets, so a browser will not send it
  over plain `http://` and sign-in appears to succeed and then bounce back to
  the login page. Terminate HTTPS with a reverse proxy on the private network
  (a VPN's built-in HTTPS serving does this) and forward to
  `127.0.0.1:3100`. `start.sh` binds the app to `127.0.0.1` only, and refuses to
  start unless `KRAKEN_APP_URL` is `https://…` or a localhost address.

### Layout

Everything lives under one directory, `$KRAKEN_HOME`. The examples use
`/srv/kraken`, but that is only an example: on macOS the root volume is
read-only, so choose a directory under the service user's home, such as
`~/kraken`. Write it out as an absolute path in `kraken.env` and the plists,
which do not expand `~`.

```
/srv/kraken/
  kraken.env      configuration, mode 600 (below)
  repo/           a git clone of this repository; deploy.sh fetches into it
  releases/<sha>/ one built copy of the app per deployed commit
  current         symlink to the live release
  storage/        invoice PDFs
  backups/        database dumps
  logs/           service output
```

`KRAKEN_HOME` is read from the process environment, not from `kraken.env`: the
launchd unit sets it (below), and in a shell you export it first.

### `kraken.env`

A shell sources this file, so single-quote every value that is a secret or
could contain a special character, as `DATABASE_URL` and
`KRAKEN_SESSION_SECRET` are below. Unquoted, a `&`, `$` or space in a password
breaks the file and can write part of the secret to the log. A value that
itself contains a `'` cannot be single-quoted, so choose a database password
without one. Create the file with `chmod 600`.

```bash
# App
DATABASE_URL='postgres://kraken:CHANGE_ME@127.0.0.1:5432/kraken'
DATABASE_POOL_MAX=2
KRAKEN_SESSION_SECRET='CHANGE_ME'   # replace with the output of: openssl rand -base64 48
KRAKEN_APP_URL=https://kraken.example
KRAKEN_AUTH_MODE=local
KRAKEN_STORAGE_MODE=local
KRAKEN_LOCAL_STORAGE_DIR=/srv/kraken/storage
KRAKEN_COMPANY_NAME="Fathom Software"
KRAKEN_COMPANY_EMAIL=billing@example.com
KRAKEN_COMPANY_ADDRESS="Port Alder BC"

# Read by the scripts
KRAKEN_SERVICE=gui/501/kraken.app   # launchd target deploy.sh restarts; 501 is `id -u`
KRAKEN_BACKUP_DIR=/srv/kraken/backups
#PORT=3100                          # optional, default 3100
#PG_BIN_DIR=/opt/postgres/bin       # optional, where pg_dump lives if not on PATH
```

- `KRAKEN_LOCAL_STORAGE_DIR` must be an absolute path. A relative one resolves
  against the live release, which a deploy replaces.
- `KRAKEN_SERVICE` is the launchd target for the app: `gui/501/kraken.app` for
  a per-user LaunchAgent, with 501 replaced by the output of `id -u` for the
  user that runs it, or `system/kraken.app` for a LaunchDaemon (see
  [launchd](#launchd)).
- Do not set `NODE_ENV`. `start.sh` sets `NODE_ENV=production` and `TZ=UTC`
  itself, and `deploy.sh` runs `npm ci --include=dev`, so the dev dependencies
  the build needs are installed whatever `NODE_ENV` says.
- The Supabase variables are not used in local mode and can be left out.

### First install

1. Create the database and a role for it, and put the connection string in
   `kraken.env`. The role should not have `CREATEDB`; it only needs to own its
   database.
2. `mkdir -p /srv/kraken/{storage,backups,logs}`, then `chmod 700 /srv/kraken`,
   then `git clone <this repository> /srv/kraken/repo`. Mode 700 matters: the
   invoice files under `storage/` are otherwise readable by every account on the
   machine.
3. Write `kraken.env`, copy the two launchd units from [launchd](#launchd) into
   place, and `launchctl bootstrap` both of them (the app and the backup).
   `kraken.app` cannot start yet, because `current` does not exist until the
   first deploy. launchd will try to start it and retry; that is expected.
4. Run `deploy.sh` (below). It builds the first release, applies the
   migrations, and restarts the app with `launchctl kickstart`, which needs the
   unit from step 3 to be loaded. If `KRAKEN_SERVICE` is not a loaded unit, or
   the restart is not allowed (option (b) below), the deploy prints the restart
   command and exits non-zero; run that command.
5. Create the operator, as the next section describes.

### The operator login

In local mode the operator is a row in `internal_users`. Nothing in a fresh
install creates it: the demo seed does, but `npm run db:seed` must never be run
against a real database. Insert the row once, with no password, then set the
password. Run the commands below from `$KRAKEN_HOME/current`, with `kraken.env`
loaded. `psql` must be on `PATH`; if your Postgres install is not, prepend its
`bin` directory (`PATH="$PG_BIN_DIR:$PATH"`, with `PG_BIN_DIR` as in
`kraken.env`):

```bash
cd /srv/kraken/current
set -a; . /srv/kraken/kraken.env; set +a
psql "$DATABASE_URL" -c "insert into internal_users (email, name) values ('operator@example.com', 'Morgan Hale')"
npm run operator:password -- operator@example.com
```

`operator:password` sets the password on an existing row, matched on email. It
does not create a user. The password must be at least 12 characters. On a
terminal it asks twice without echo; when its input is piped it reads one line
from stdin. Run it again to change the password.

### Deploying

`deploy.sh` ships `origin/main` of the clone in `repo/`:

```bash
KRAKEN_HOME=/srv/kraken /srv/kraken/current/scripts/selfhost/deploy.sh
```

Run the copy in `current/`, as above. `repo/` is only ever fetched, never
checked out, so the copy of the script under `repo/scripts/selfhost/` is the
one from clone time. The very first deploy has no `current` yet, so it uses
`repo/scripts/selfhost/deploy.sh`.

It fetches `origin/main`, exports that commit to `releases/<sha>/`, runs
`npm ci --include=dev`, `npm run build` and `npm run db:migrate` there,
switches `current` to the new release, restarts the app with
`launchctl kickstart -k "$KRAKEN_SERVICE"`, and keeps the new release and the
previous one. A failed build or migration leaves `current` and the running app
untouched.

If the restart fails, the deploy is half done: `current` points at the new
release and its migrations are applied, but the app has not been restarted, so
whatever was running before keeps running. `deploy.sh` then prints, on stderr, a message naming the
sha and the exact command to run (`launchctl kickstart -k "<KRAKEN_SERVICE>"`),
still removes the old releases, and exits non-zero. Run that command.

When `current` already resolves to the release for `origin/main`, the script
prints `Already deployed <sha>` and does nothing. That includes not restarting
the app, so re-running a deploy is not a way to restart it after a failed
restart; use the printed command. If `current` is a link to a release directory
that no longer exists, the script rebuilds that release instead.

Migrations run before the switch, so the same caveat as §2 applies: a migration
that removes something the running release still reads will break it until the
restart.

### Backups

`backup.sh` writes a custom-format dump of the database:

```bash
KRAKEN_HOME=/srv/kraken /srv/kraken/current/scripts/selfhost/backup.sh
```

It runs `pg_dump --format=custom --no-owner --no-privileges` into
`$KRAKEN_BACKUP_DIR/kraken-<UTC timestamp>.dump` (mode 600) and keeps the 14
newest dumps. It passes `DATABASE_URL` to `pg_dump` on the command line, so the
database password is visible in `ps` to other local users of that machine. That
is acceptable on a single-user machine; if it is not on yours, use a role
whose password is in a `~/.pgpass` file and leave the password out of the URL.

To restore, into an empty database, with `createdb` and `pg_restore` on `PATH`
(prepend `PG_BIN_DIR` as above if they are not). The application's role cannot
create databases, so run `createdb` as a Postgres superuser:

```bash
createdb --owner=kraken kraken_restored
pg_restore --no-owner --no-privileges --dbname=postgres://kraken:<password>@127.0.0.1:5432/kraken_restored /srv/kraken/backups/kraken-<stamp>.dump
```

A failed nightly backup is visible only in the backup unit's error log,
`logs/backup.err.log`. Nothing alerts you, so check that file.

Invoice PDFs are not in the dump: they live in `storage/`, so back that
directory up as well.

**A file-level copy of a running Postgres data directory is not a usable
backup.** It is not consistent, and it can look fine until the day you restore
it. The dump is the backup. Copy the dumps off the machine too; a backup on
the same disk does not survive the disk.

### launchd

Two units, with the labels `kraken.app` (the web app) and `kraken.backup` (the
nightly dump). There are two ways to run them. Choose one, and set
`KRAKEN_SERVICE` in `kraken.env` to match.

**(a) A per-user LaunchAgent. Recommended for one operator.** Put the plists in
`~/Library/LaunchAgents/` and load them as the user who owns `$KRAKEN_HOME`:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/kraken.app.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/kraken.backup.plist
```

Set `KRAKEN_SERVICE=gui/501/kraken.app`, replacing 501 with the output of
`id -u`. Nothing needs sudo, so `deploy.sh` runs end to end as that user. The
catch: a LaunchAgent only runs while that user has a login session. The machine
must log that user in automatically at boot, or nothing starts after a reboot.
Automatic login is unavailable while FileVault is on, so with FileVault the
app only starts once someone logs in as that user.

**(b) A system LaunchDaemon.** Put the plists in `/Library/LaunchDaemons/`,
owned by root, and load them with sudo:

```bash
sudo launchctl bootstrap system /Library/LaunchDaemons/kraken.app.plist
sudo launchctl bootstrap system /Library/LaunchDaemons/kraken.backup.plist
```

Set `KRAKEN_SERVICE=system/kraken.app`. This starts at boot with nobody logged
in. Add a `UserName` key to both plists, naming an unprivileged account (the
examples use `kraken`). That account must exist before the first install and
must own all of `$KRAKEN_HOME` (`sudo chown -R kraken /srv/kraken`), and the
commands in the other steps, such as setting the operator password or taking a
manual backup, are run as that account. Never run the app as root: a daemon
with no `UserName` key does.

```xml
  <key>UserName</key>
  <string>kraken</string>
```

The cost is the restart step. `launchctl kickstart` on the `system` domain
needs root, and `deploy.sh` has no way to elevate itself. Everything it writes
must end up owned by `kraken`, so run it as that user:

```bash
sudo -H -u kraken env KRAKEN_HOME=/srv/kraken /srv/kraken/current/scripts/selfhost/deploy.sh
```

`sudo` resets the environment, which is why `KRAKEN_HOME` is passed through
`env`, and `-H` sets `HOME` to the service user's home, so npm's cache goes
there. `node`, `npm` and `git` must be on the `PATH` that `sudo` gives the
command; if they are not, add `PATH=…` after `env` as well. The first deploy
runs `repo/scripts/selfhost/deploy.sh` instead, as in [Deploying](#deploying).

The build, migrations and the switch of `current` succeed, the restart fails,
and the script prints the restart command, removes the old releases and exits
non-zero. That happens on every deploy, the first one included. Restart the
app yourself afterwards with `sudo launchctl kickstart -k system/kraken.app`.
If you would rather the deploy be one command, use (a).

The plists below are for (a). For (b), add the `UserName` key shown above and
change nothing else.

The app, `kraken.app.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>kraken.app</string>
  <key>ProgramArguments</key>
  <array>
    <string>/srv/kraken/current/scripts/selfhost/start.sh</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>KRAKEN_HOME</key>
    <string>/srv/kraken</string>
    <key>PATH</key>
    <string>/opt/node/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/srv/kraken/logs/app.log</string>
  <key>StandardErrorPath</key>
  <string>/srv/kraken/logs/app.err.log</string>
</dict>
</plist>
```

The nightly backup, `kraken.backup.plist`, at 03:00:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>kraken.backup</string>
  <key>ProgramArguments</key>
  <array>
    <string>/srv/kraken/current/scripts/selfhost/backup.sh</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>KRAKEN_HOME</key>
    <string>/srv/kraken</string>
    <key>PATH</key>
    <string>/opt/postgres/bin:/usr/bin:/bin</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>3</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>/srv/kraken/logs/backup.log</string>
  <key>StandardErrorPath</key>
  <string>/srv/kraken/logs/backup.err.log</string>
</dict>
</plist>
```

The `PATH` in the app unit must include the directory that holds `node`; launchd
does not read your shell profile. Until the first deploy creates `current`, both
units point at a script that does not exist; the backup simply does nothing
until its 03:00 run finds it.

### Local mode and the tests

`npm run db:seed` refuses to run when the database holds a client the demo seed
did not create, and `npm run db:reset` ends in `db:seed`. That guard is a
backstop, not permission: never point either command at a database you care
about. The tests and `npm run dev` use the same local mode, so a feature gated
on one mode is untested or unused in the other.

## Operational notes

- **Runtime.** Every route runs on the Node runtime; the Postgres driver and the
  argon2 binding are not Edge-compatible. `serverExternalPackages` in
  `next.config.ts` keeps them out of the bundle.
- **Backups.** Supabase takes daily backups on paid plans. Invoices are the data
  you cannot reconstruct — check that backups are on before issuing the first
  one. On a self-hosted machine the backups are yours to take; see
  [Backups](#backups) in the self-hosting section.
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
