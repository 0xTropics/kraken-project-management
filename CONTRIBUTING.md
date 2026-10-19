# Contributing to Kraken

Issues and pull requests are welcome. Kraken is maintained by one person, so
please **open an issue before starting anything large**: a new feature, a new
table, a change to how invoices or the portal work. A short conversation first
saves you from building something that will not be merged.

Bug fixes, tests, accessibility fixes and documentation corrections can go
straight to a pull request.

## Setup

The [README](./README.md#getting-started) has the full steps. In short, you need
Node 22.13 or later up to 24.x (`.nvmrc` pins 24) and the PostgreSQL 15+
binaries, on macOS, Linux or WSL:

```bash
nvm install
npm ci
cp .env.example .env.local   # then set KRAKEN_SESSION_SECRET
npm run db:start && npm run db:migrate && npm run db:seed
npx playwright install chromium   # add --with-deps on Linux
npm run dev                  # http://localhost:3100
```

Next.js 16 has breaking changes from earlier versions. When in doubt about an
API, read the guide for the installed version in `node_modules/next/dist/docs/`
rather than relying on memory.

## There is one deployment, and it is Vercel + Supabase

Kraken runs in production on Vercel with Supabase for Postgres, Auth and
Storage, using `KRAKEN_AUTH_MODE=supabase` and `KRAKEN_STORAGE_MODE=supabase`.
That is the product.

`local` mode is a **test and development harness, not a deployment option**. It
is what `npm test`, `npm run dev`, the Playwright suite and the `check:*` scripts
run against, because they need a Postgres on `localhost` and no cloud project.
Please do not delete it, and do not document it as a way to run Kraken.

The consequence to keep in mind:

- A feature gated on `env.authMode === "local"` is dead code in production.
- A feature gated on `supabase` has no test covering it.
- When you touch identity, files or sessions, the local path is the one the
  tests prove and the supabase path is the one that ships. A green
  `npm run verify` says nothing about the second, so say in your pull request how
  you checked it.

## Stack facts

These are decided. Please don't change them without an issue.

- Next.js 16 App Router, React 19, TypeScript with `strict` on, Tailwind v4.
- Postgres through [`postgres`](https://github.com/porsager/postgres) tagged
  templates, with no ORM: `import { sql } from "@/lib/db/client"`.
- `numeric` columns arrive as numbers. `date` columns arrive as `YYYY-MM-DD`
  strings; never `new Date(dateColumn)`.
- `noUncheckedIndexedAccess` is off, so `const [row] = await sql<T[]>...` is typed
  `T`, not `T | undefined`. Guard a single-row destructure by hand:
  `const [row] = ...; if (!row) throw ...`.
- Internal auth: `getInternalSession()`, `requireInternalSession()` and
  `requireInternalPage()` from `@/lib/auth/internal`.
- Validation: zod v4 schemas in `@/lib/api/schemas`.
- Route handlers: wrap internal routes in `internalHandler` from
  `@/lib/api/handler`. It authenticates, shapes errors and sets status codes.
- Money arithmetic is integer cents, through `toCents` and `fromCents` in
  `@/lib/format`. The billing rules are in the next section.
- Migrations in `supabase/migrations/` are append-only. The runner records a
  SHA-256 checksum for each file and refuses to run if an applied one changed, so
  fix a migration by adding a new one.

## Invoicing rules you can't infer from the code

The engine is in `src/lib/invoices/` and the reads are in `src/lib/data/`.
Breaking one of these rules usually still typechecks.

- **A deposit is applied after tax**, as `invoices.deposit_applied`, never as a
  negative line, which would shrink the taxable base. The balance is derived
  (deposits received minus `deposit_applied` on non-void invoices), never
  stored, so voiding an invoice returns its deposit.
- **Billed-to details are a snapshot** (`bill_to_*`) frozen at finalization.
  Reads select `case when status = 'draft' then <live> else <snapshot> end`,
  never `coalesce(snapshot, live)`: the snapshot is legitimately null on a
  finalized invoice whose client had no primary contact, and `coalesce` would
  un-freeze it.
- **"Outstanding" is `total - deposit_applied` on sent invoices.** The operator
  app computes it in five places (clients, invoices, projects, reports data,
  and the reports table and chart), and the portal in `outstandingTotal()`.
  Change them together.
- **Branch on `billing_model` only through `src/lib/billing-model.ts`** or an
  exhaustive `switch` ending in `assertNever`. It has three values, and a
  two-way ternary sends the third down the else.
- **Charge lines use the `adhoc` kind**, or `build` for build charges, and
  `invoice_lines.charge_id` is what marks a line as a charge, never the kind.
  `maintenance` and `build` lines come only from the engine: `addInvoiceLine`
  refuses them.
- **A charge's billed state is derived**: a line on a non-void invoice points
  at it. `charge_id` is `on delete restrict`, so a charge whose only lines are
  on voided invoices cannot be deleted; it is withdrawn with
  `project_charges.cancelled_at` instead.
- **Maintenance coverage is a set of periods**: those of non-void invoices
  carrying a `maintenance` line, drafts included. It lives once, in
  `listCoveredPeriods()` (`src/lib/data/maintenance.ts`) and `nextTermPeriod()`
  (`src/lib/invoices/maintenance.ts`). Never test coverage with "any
  overlapping invoice".
- **Revenue is bucketed on `least(period_end, finalized_at::date)`**, so a
  prepaid term counts in the month it was issued, not the month it ends.
- **`invoices_guard_immutable()` is a column deny-list**: a new column on
  `invoices` is mutable after finalization until you add it to the guard. To
  extend it, copy the current body from the latest migration that defines it
  and add your clause.

## Design system

Everything lives in `src/components/ui/`. Use it rather than reinventing it, and
**never hard-code a color**: use the CSS variables (`var(--text-primary)`,
`var(--bg-hover)`, `var(--border-subtle)`, `var(--accent)` and so on) defined in
`src/app/globals.css`. They are what makes dark mode work.

| Need | Use |
|---|---|
| Button, IconButton | `@/components/ui/button` |
| Input, Textarea, NativeSelect, Field, InlineInput | `@/components/ui/field` |
| Badge, StatusBadge, TypeIcon, PriorityDot, `*_META` maps | `@/components/ui/badge` |
| Card, CardHeader, PageHeader, SectionTitle, SectionLink | `@/components/ui/card` |
| Menu / dropdown | `@/components/ui/menu` |
| Modal, ConfirmDialog, SheetContent | `@/components/ui/modal` |
| Tooltip | `@/components/ui/tooltip` |
| Switch, Checkbox, Segmented | `@/components/ui/toggles` |
| TabNav | `@/components/ui/tab-nav` |
| Table, THead, TH, TBody, TR, TD | `@/components/ui/table` |
| EmptyState, ErrorState | `@/components/ui/empty-state` |
| Skeleton, ListSkeleton, CardsSkeleton | `@/components/ui/skeleton` |
| Client-side fetch + toasts | `api`, `run` from `@/lib/client-api` |

Type scale: `text-2xs` 11px · `text-xs` 12px · `text-sm` 13px (internal body) ·
`text-base` 14px (controls) · `text-md` 16px (portal body) · `text-lg` 17px ·
`text-xl` 21px · `text-2xl` 28px · `text-3xl` 36px.

Density: table rows are 36px, work-item list rows are at least 44px, and buttons
are 24, 28, 32 or 36px. The internal app is deliberately dense. The portal is
deliberately looser: bigger type, more whitespace, fewer controls.

## Non-negotiables

1. **Every page and route re-checks authorization.** `src/proxy.ts` is a first
   filter, never the boundary. Every page, layout and `generateMetadata` under
   `src/app/app` calls `await requireInternalPage()` as its first statement
   (`test/unit/internal-pages-auth.test.ts` fails `npm run verify` if one does not), and
   every internal API route is wrapped in `internalHandler` or calls
   `requireInternalSession()`.
2. **The portal reads only through `src/lib/data/portal.ts`.** No portal route
   accepts a project id from a request.
3. **Finalized invoices are immutable.** Void and reissue.
4. **The audit log is append-only.** Write to it with `appendAudit`.
5. **Never log or return `portal_password_hash` or a plaintext password.**

## Every surface needs

- A real **empty state** (`EmptyState`): what this is for, and the action that
  fills it.
- A **loading** state: a `loading.tsx` with skeletons that match the real layout.
- An **error** boundary. `src/app/app/error.tsx` covers every operator page
  inside the shell, `src/app/app/projects/[slug]/error.tsx` keeps the project
  tabs, and the portal has its own in `src/app/portal/[slug]/error.tsx`. Add a
  segment `error.tsx` only when a surface needs different chrome.
- **Mobile** that works at 390px. Time entry and the dashboard must be
  genuinely good there.
- **Keyboard** access: real `<button>` and `<a>`, visible focus, Escape closes
  overlays.
- **Dark and light** both checked.

## Tests

`test/security/` is the spec. It tries to do the things Kraken forbids, against
a real Postgres with the real schema. The security logic runs for real; the
only stub is the request's cookie jar in `internal-page-guard.test.ts`. If your change
moves a boundary (who can see what, what can no longer be edited, what is
logged), it comes with a test there that fails without your change.

Everything else comes with tests too:

| Where | What |
|---|---|
| `test/unit/` | pure logic |
| `test/integration/` | data and route behaviour against real Postgres |
| `test/security/` | the adversarial suite |
| `test/e2e/` | Playwright, at desktop and phone width |

Vitest needs the local cluster running (`npm run db:start`). Each run creates
its own database on it and applies the real migrations, so the tests exercise the
same constraints and triggers production has.

## Checks

| Command | What it does |
|---|---|
| `npm run verify` | typecheck, lint, all Vitest tests and a production build |
| `npm run test:e2e` | Playwright; starts the dev server itself if it is not running |
| `npm run check:a11y` | axe-core, WCAG 2.1 AA; needs the dev server up |
| `npm run check:responsive` | fails if anything overflows the viewport; needs the dev server up |
| `npm run shots` | screenshots of every surface into `docs/evidence/current` (git-ignored) |

`check:a11y` walks routes and cannot open a dialog, so a modal, a side panel and
anything else behind a click is invisible to it. A clean run does not mean the
surface you built was checked: open it by hand and run axe against it.

## Commit messages

Use [conventional commits](https://www.conventionalcommits.org/):
`type(scope): subject`, with a short imperative subject.

```
feat(portal): lock out a portal login after 10 failures in 15 minutes
fix(ui): period stepper fits one row on a phone
docs: accurate Node and throttling notes
```

The types in use are `feat`, `fix`, `docs`, `refactor`, `test` and `chore`.
Keep one logical change per commit.

## Pull requests

1. Fork the repository and branch from `main`.
2. Make the change, with its tests.
3. Run `npm run verify` and `npm run test:e2e`. For UI changes, run
   `npm run check:a11y` and `npm run check:responsive` too.
4. Open a pull request and fill in the template. Include screenshots for UI
   changes.

CI runs `npm run verify` on Node 22.13 and 24, and `npm run test:e2e`, on every
pull request and every push to `main`. `check:a11y` and `check:responsive` are
not in CI; run them locally.

### Definition of done

- `npm run verify` is clean, and `npm run test:e2e` passes.
- For a UI change, the pages render with no console errors at 1440px and 390px
  in both themes, `check:a11y` and `check:responsive` pass, and you have looked at
  your own screenshots. Any change to a shared layout component (sidebar, nav,
  form controls) gets `check:a11y` before it is called done.
- No secrets, credentials or real client data anywhere in the diff, the tests or
  the commit messages.

## License

By contributing, you agree that your contribution is licensed under the
[MIT license](./LICENSE).
