import { sql, type Db } from "@/lib/db/client";
import type { Currency, DateString, MaintenanceTerm, Project } from "@/lib/db/types";
import { conflict, notFound } from "@/lib/errors";
import { addDays, formatMoney, fromCents, toCents } from "@/lib/format";
import {
  coveredThroughOf,
  nextTermPeriod,
  termPriceCents,
  type CoveredPeriod,
  type TermPeriod,
} from "@/lib/invoices/maintenance";

/**
 * THE definition of maintenance coverage: the periods of non-void invoices
 * carrying a `maintenance` line, per project. A set of periods, not a single
 * date -- voiding a term that is not the latest leaves a hole behind later
 * coverage, and `nextTermPeriod` finds it.
 *
 * - Drafts count. A draft covering a term is a claim on it; counting it is
 *   what stops the same term being drafted twice.
 * - Void invoices drop out, so voiding a term uncovers it with no release code.
 * - The `exists` on a maintenance line is load-bearing: a build-installment or
 *   charges-only invoice dated this month is not coverage. The retainer run's
 *   "any overlapping invoice" predicate would get this wrong. Never test
 *   coverage any other way.
 */
export async function listCoveredPeriods(
  projectIds: string[],
  db: Db = sql,
): Promise<Map<string, CoveredPeriod[]>> {
  const covered = new Map<string, CoveredPeriod[]>(projectIds.map((id) => [id, []]));
  if (projectIds.length === 0) return covered;
  const rows = await db<{ project_id: string; period_start: DateString; period_end: DateString }[]>`
    select i.project_id, i.period_start, i.period_end
    from invoices i
    where i.project_id in ${db(projectIds)}
      and i.status <> 'void'
      and exists (
        select 1 from invoice_lines l
        where l.invoice_id = i.id and l.kind = 'maintenance'
      )
    order by i.period_start
  `;
  for (const row of rows) {
    covered.get(row.project_id)?.push({ start: row.period_start, end: row.period_end });
  }
  return covered;
}

export async function getCoveredPeriods(projectId: string, db: Db = sql): Promise<CoveredPeriod[]> {
  return (await listCoveredPeriods([projectId], db)).get(projectId) ?? [];
}

/** The latest covered day. For display: the next term comes from the periods, not this. */
export async function getCoveredThrough(projectId: string): Promise<DateString | null> {
  return coveredThroughOf(await getCoveredPeriods(projectId));
}

export type MaintenanceProjectFields = Pick<
  Project,
  | "id"
  | "maintenance_monthly"
  | "maintenance_price_6"
  | "maintenance_price_12"
  | "maintenance_term_months"
  | "maintenance_starts_on"
>;

export interface MaintenanceStatus {
  covered_through: DateString | null;
  /** Null until a start month is set: nothing can be drafted. */
  next_term: TermPeriod | null;
  /** The next term starts before the latest coverage ends: a voided term left a hole. */
  has_gap: boolean;
  /** What the current term costs before tax, prepay price applied. */
  term_price: number;
}

export async function getMaintenanceStatus(
  project: MaintenanceProjectFields,
): Promise<MaintenanceStatus> {
  if (project.maintenance_monthly === null) {
    throw conflict("Only a build + maintenance project has maintenance terms", "not_maintenance");
  }
  const pricing = {
    maintenance_monthly: project.maintenance_monthly,
    maintenance_price_6: project.maintenance_price_6,
    maintenance_price_12: project.maintenance_price_12,
  };
  const periods = await getCoveredPeriods(project.id);
  const coveredThrough = coveredThroughOf(periods);
  const nextTerm =
    project.maintenance_starts_on === null
      ? null
      : nextTermPeriod(periods, project.maintenance_starts_on, project.maintenance_term_months);
  return {
    covered_through: coveredThrough,
    next_term: nextTerm,
    has_gap: nextTerm !== null && coveredThrough !== null && nextTerm.start < coveredThrough,
    term_price: fromCents(termPriceCents(pricing, project.maintenance_term_months)),
  };
}

export interface BuildFeeProgress {
  currency: Currency;
  build_fee: number | null;
  /** Every build installment recorded and not cancelled, on an invoice or not. */
  recorded: number;
  /** Installments on a sent or paid invoice -- what has actually gone to the client. */
  invoiced: number;
  /** build_fee − recorded. Null when the project has no build fee. */
  left: number | null;
}

export async function getBuildFeeProgress(projectId: string, db: Db = sql): Promise<BuildFeeProgress> {
  const [row] = await db<{ currency: Currency; build_fee: number | null; recorded: number; invoiced: number }[]>`
    select p.currency, p.build_fee,
           coalesce(sum(c.amount), 0) as recorded,
           coalesce(sum(case when exists (
             select 1 from invoice_lines l
             join invoices i on i.id = l.invoice_id
             where l.charge_id = c.id and i.status in ('sent', 'paid')
           ) then c.amount else 0 end), 0) as invoiced
    from projects p
    left join project_charges c
      on c.project_id = p.id and c.kind = 'build' and c.cancelled_at is null
    where p.id = ${projectId}
    group by p.id, p.currency, p.build_fee
  `;
  if (!row) throw notFound("That project no longer exists");
  return {
    currency: row.currency,
    build_fee: row.build_fee,
    recorded: row.recorded,
    invoiced: row.invoiced,
    left: row.build_fee === null ? null : fromCents(toCents(row.build_fee) - toCents(row.recorded)),
  };
}

/** A build fee may not drop below the installments already recorded against it. */
export async function assertBuildFeeCoversRecorded(
  projectId: string,
  buildFee: number | null,
): Promise<void> {
  const { recorded, currency } = await getBuildFeeProgress(projectId);
  if (recorded > 0 && (buildFee === null || toCents(buildFee) < toCents(recorded))) {
    throw conflict(
      `${formatMoney(recorded, currency)} of build installments are already recorded, so the build fee can't be lower than that`,
      "build_fee_below_recorded",
    );
  }
}

export interface MonthlyMaintenanceRow {
  id: string;
  name: string;
  slug: string;
  client_name: string;
  maintenance_starts_on: DateString;
  covered_through: DateString | null;
}

/**
 * Monthly-term maintenance projects that have started by `periodStart`, split
 * into those due a draft and a count of those already current. Due means the
 * next term starts on or before `periodStart` -- computed with nextTermPeriod,
 * so the run and the project's Draft next term button cannot disagree. The
 * run preview and the run itself both call this; there is no second predicate.
 */
export async function maintenanceRunCandidates(
  periodStart: DateString,
): Promise<{ due: MonthlyMaintenanceRow[]; current: number }> {
  const projects = await sql<Omit<MonthlyMaintenanceRow, "covered_through">[]>`
    select p.id, p.name, p.slug, c.name as client_name, p.maintenance_starts_on
    from projects p
    join clients c on c.id = p.client_id
    where p.billing_model = 'maintenance'
      and p.status = 'active'
      and p.archived_at is null
      and p.maintenance_term_months = 1
      and p.maintenance_starts_on is not null
      and p.maintenance_starts_on <= ${periodStart}
    order by c.name, p.name
  `;
  const covered = await listCoveredPeriods(projects.map((p) => p.id));
  const due: MonthlyMaintenanceRow[] = [];
  for (const project of projects) {
    const periods = covered.get(project.id) ?? [];
    if (nextTermPeriod(periods, project.maintenance_starts_on, 1).start <= periodStart) {
      due.push({ ...project, covered_through: coveredThroughOf(periods) });
    }
  }
  return { due, current: projects.length - due.length };
}

export interface RenewalDue {
  id: string;
  name: string;
  slug: string;
  client_name: string;
  currency: Currency;
  term_months: MaintenanceTerm;
  maintenance_starts_on: DateString;
  covered_through: DateString | null;
  next_start: DateString;
}

/**
 * Prepaid projects whose current coverage ends within 30 days, has already
 * lapsed, or that start within 31 days with nothing invoiced -- one condition:
 * the next term starts on or before today + 31. Prepaid renewals are never
 * drafted automatically; this is the flag.
 */
export async function listRenewalsDue(today: DateString): Promise<RenewalDue[]> {
  const projects = await sql<Omit<RenewalDue, "next_start" | "covered_through">[]>`
    select p.id, p.name, p.slug, c.name as client_name, p.currency,
           p.maintenance_term_months as term_months, p.maintenance_starts_on
    from projects p
    join clients c on c.id = p.client_id
    where p.billing_model = 'maintenance'
      and p.status = 'active'
      and p.archived_at is null
      and p.maintenance_term_months in (6, 12)
      and p.maintenance_starts_on is not null
    order by c.name, p.name
  `;
  const horizon = addDays(today, 31);
  const covered = await listCoveredPeriods(projects.map((p) => p.id));
  return projects
    .map((project) => {
      const periods = covered.get(project.id) ?? [];
      return {
        ...project,
        covered_through: coveredThroughOf(periods),
        next_start: nextTermPeriod(periods, project.maintenance_starts_on, project.term_months).start,
      };
    })
    .filter((row) => row.next_start <= horizon);
}
