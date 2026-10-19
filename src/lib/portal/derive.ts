import { PORTAL_STATUS_LABELS, PORTAL_VISIBLE_STATUSES } from "@/lib/db/types";
import type {
  PortalHours,
  PortalInvoice,
  PortalUpdate,
  PortalWorkItem,
} from "@/lib/data/portal";

/**
 * Everything the portal dashboard computes, away from the markup.
 *
 * This repo has no React testing stack, so a rule living inside a component is
 * a rule covered only end to end. Anything with a decision in it belongs here.
 */

export type PortalVisibleStatus = (typeof PORTAL_VISIBLE_STATUSES)[number];

export interface PortalBoardColumn {
  status: PortalVisibleStatus;
  label: string;
  items: PortalWorkItem[];
}

/**
 * Every client-visible work item, dealt into the three columns a client may see.
 *
 * The columns come from PORTAL_VISIBLE_STATUSES rather than a literal, so an
 * item whose status the portal does not admit -- `backlog`, `wont_do` --
 * lands nowhere instead of inventing a fourth column. The queries
 * already filter those out; this is the second line of that defence.
 */
export function buildBoard(workItems: PortalWorkItem[]): PortalBoardColumn[] {
  return PORTAL_VISIBLE_STATUSES.map((status) => {
    const items = workItems.filter((item) => item.status === status);

    // Done is a history and reads newest first. Planned and In progress keep
    // the query's order, which is the operator's own arrangement: milestone,
    // then sort_order. Re-sorting those would throw that away.
    if (status === "done") {
      items.sort((a, b) => {
        if (!a.completed_at && !b.completed_at) return 0;
        if (!a.completed_at) return 1;
        if (!b.completed_at) return -1;
        return b.completed_at.localeCompare(a.completed_at);
      });
    }

    return { status, label: PORTAL_STATUS_LABELS[status] ?? status, items };
  });
}

/**
 * What the client actually owes: the same formula as the other five sites that
 * render "outstanding". A paid invoice owes nothing; a deposit already applied
 * is not owed twice.
 */
export function outstandingTotal(invoices: PortalInvoice[]): number {
  return invoices
    .filter((invoice) => invoice.status === "sent")
    .reduce((sum, invoice) => sum + (invoice.total - invoice.deposit_applied), 0);
}

/** Zero for a retainer project, where `getPortalHours` returns null by design. */
export function hoursInvoicedToDate(hours: PortalHours | null): number {
  if (!hours) return 0;
  return hours.periods.reduce((sum, period) => sum + period.hours, 0);
}

/** The query orders updates newest first, so the head is the answer. */
export function lastUpdateAt(updates: PortalUpdate[]): string | null {
  const [newest] = updates;
  return newest ? String(newest.created_at) : null;
}
