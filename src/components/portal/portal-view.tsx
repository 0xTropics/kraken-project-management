import { KrakenMark } from "@/components/app-shell/kraken-mark";
import { Wordmark } from "@/components/app-shell/wordmark";
import {
  getPortalWorkItems,
  getPortalHours,
  getPortalInvoices,
  getPortalProject,
  getPortalRequests,
  getPortalUpdates,
  type PortalScope,
} from "@/lib/data/portal";
import { buildBoard, lastUpdateAt } from "@/lib/portal/derive";
import { env } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { PortalBoard } from "./portal-board";
import { PortalInvoicesTab } from "./portal-invoices";
import { PortalRequests } from "./portal-requests";
import { PortalTabs, type PortalTab } from "./portal-tabs";
import { PortalUpdates } from "./portal-updates";
import { PortalDot, PortalPill } from "./primitives";

/**
 * The whole client-facing view, rendered from a `PortalScope` and nothing else.
 * Reused verbatim by the internal "Portal preview" tab, which is
 * why it takes a scope rather than reading the cookie itself -- the preview
 * proves what the client sees because it is literally the same component over
 * the same queries.
 *
 * The page does not scroll on desktop: the shell is a column of fixed bands and
 * the board fills what is left, with each column scrolling inside itself. Below
 * `lg` that inverts -- the columns stop being scrollers and the document
 * scrolls, because `check:responsive` fails a page that does both and a phone
 * cannot honour the first.
 */

const STATUS_TONE = {
  active: "success",
  paused: "warning",
  completed: "info",
  archived: "neutral",
} as const;

export async function PortalView({
  scope,
  tab = "overview",
  preview = false,
}: {
  scope: PortalScope;
  tab?: PortalTab;
  preview?: boolean;
}) {
  const project = await getPortalProject(scope);
  if (!project) return null;

  const [updates, workItems, hours, invoices] = await Promise.all([
    getPortalUpdates(scope, 60),
    getPortalWorkItems(scope),
    getPortalHours(scope),
    getPortalInvoices(scope),
  ]);

  const requests = tab === "requests" ? await getPortalRequests(scope) : [];
  const columns = buildBoard(workItems);
  const updatedAt = lastUpdateAt(updates);

  return (
    <div className={preview ? "flex flex-col" : "flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden"}>
      {/* Chrome ------------------------------------------------------- */}
      {/* Three tabs and sign-out do not fit beside the wordmark at 390px, so
          below `sm` the mark stands alone and the gaps tighten. */}
      <div className="flex shrink-0 items-stretch justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-app)] px-5 sm:gap-6 md:px-8">
        <div className="flex items-stretch gap-3 sm:gap-7">
          <div className="flex items-center gap-2.5">
            <KrakenMark className="size-4.5" />
            <Wordmark className="hidden sm:flex" />
          </div>
          <PortalTabs active={tab} slug={project.slug} preview={preview} />
        </div>

        {preview ? (
          <span
            aria-disabled="true"
            title="Sign out is inert in the preview."
            className="flex items-center text-base text-[var(--text-tertiary)] opacity-60"
          >
            Sign out
          </span>
        ) : (
          <form action="/api/portal/logout" method="post" className="flex items-center">
            <button
              type="submit"
              className="text-base text-[var(--text-tertiary)] underline-offset-2 hover:text-[var(--text-secondary)] hover:underline"
            >
              Sign out
            </button>
          </form>
        )}
      </div>

      {/* Body --------------------------------------------------------- */}
      <div className="flex min-h-0 flex-1 flex-col gap-5 px-5 py-6 md:px-8">
        <header className="flex shrink-0 flex-wrap items-end justify-between gap-x-10 gap-y-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
                {project.name}
              </h1>
              <PortalPill tone={STATUS_TONE[project.status]}>
                <PortalDot tone={STATUS_TONE[project.status]} />
                {project.status[0].toUpperCase() + project.status.slice(1)}
              </PortalPill>
            </div>
            {project.description && (
              <p className="mt-1.5 max-w-[60ch] text-base text-[var(--text-secondary)]">
                {project.description}
              </p>
            )}
          </div>

          <dl className="flex flex-wrap gap-x-9 gap-y-3">
            {project.started_at && <Fact label="Started">{formatDate(project.started_at)}</Fact>}
            {updatedAt && (
              <Fact label="Last update">{formatDate(String(updatedAt).slice(0, 10))}</Fact>
            )}
            <Fact label="Contact">
              {env.companyEmail ? (
                <a
                  href={`mailto:${env.companyEmail}`}
                  className="text-[var(--accent-text)] underline decoration-[color-mix(in_srgb,var(--accent-text)_40%,transparent)] underline-offset-2 hover:decoration-[var(--accent-text)]"
                >
                  {env.companyName}
                </a>
              ) : (
                env.companyName
              )}
            </Fact>
          </dl>
        </header>

        {tab === "invoices" ? (
          <PortalInvoicesTab
            project={project}
            invoices={invoices}
            hours={hours}
            preview={preview}
          />
        ) : tab === "requests" ? (
          <PortalRequests requests={requests} preview={preview} />
        ) : (
          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_1fr_1fr_0.95fr]">
            <PortalBoard columns={columns} />
            <PortalUpdates updates={updates} />
          </div>
        )}
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-2xs font-semibold uppercase tracking-[0.09em] text-[var(--text-tertiary)]">
        {label}
      </dt>
      <dd className="mt-0.5 text-base text-[var(--text-primary)]">{children}</dd>
    </div>
  );
}
