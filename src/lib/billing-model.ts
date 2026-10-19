import type { BillingModel, Currency } from "@/lib/db/types";
import { formatMoney } from "@/lib/format";

/**
 * Every place that branches on `billing_model` goes through here, or through
 * an exhaustive switch ending in `assertNever`. With three models, a two-way
 * `=== "hourly" ? … : …` silently drops the third into whichever side is the
 * else -- the invoice document would have labelled a maintenance invoice
 * "Time and materials". A fourth model now fails typecheck at every site
 * instead.
 *
 * Client-safe: no database imports.
 */

export function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${String(value)}`);
}

/** Internal name: badges, tooltips, the billing-model picker. */
export function billingModelLabel(model: BillingModel): string {
  switch (model) {
    case "hourly":
      return "Hourly";
    case "retainer":
      return "Retainer";
    case "maintenance":
      return "Build + maintenance";
    default:
      return assertNever(model);
  }
}

/** What the client reads under "Project" on the invoice and its PDF. */
export function billingModelDescription(model: BillingModel): string {
  switch (model) {
    case "hourly":
      return "Time and materials";
    case "retainer":
      return "Monthly retainer";
    case "maintenance":
      return "Website build and maintenance";
    default:
      return assertNever(model);
  }
}

/** The one-letter glyph in the sidebar and the command palette. */
export function billingModelInitial(model: BillingModel): string {
  switch (model) {
    case "hourly":
      return "H";
    case "retainer":
      return "R";
    case "maintenance":
      return "M";
    default:
      return assertNever(model);
  }
}

export interface RateFields {
  billing_model: BillingModel;
  currency: Currency;
  hourly_rate: number | null;
  retainer_amount: number | null;
  maintenance_monthly: number | null;
}

/** "$150.00/h", "$4,000.00/mo", "$150.00/mo maintenance" -- or the model's name when its figure is missing. */
export function billingRateLabel(p: RateFields): string {
  switch (p.billing_model) {
    case "hourly":
      return p.hourly_rate ? `${formatMoney(p.hourly_rate, p.currency)}/h` : "Hourly";
    case "retainer":
      return p.retainer_amount ? `${formatMoney(p.retainer_amount, p.currency)}/mo` : "Retainer";
    case "maintenance":
      return p.maintenance_monthly
        ? `${formatMoney(p.maintenance_monthly, p.currency)}/mo maintenance`
        : "Maintenance";
    default:
      return assertNever(p.billing_model);
  }
}

/** The flat monthly fee, for the models that have one. */
export function monthlyFlatFee(
  p: Pick<RateFields, "billing_model" | "retainer_amount" | "maintenance_monthly">,
): number | null {
  switch (p.billing_model) {
    case "hourly":
      return null;
    case "retainer":
      return p.retainer_amount;
    case "maintenance":
      return p.maintenance_monthly;
    default:
      return assertNever(p.billing_model);
  }
}

/** The noun a flat fee's hours are logged against. Null for hourly, which has none. */
export function flatFeeName(model: BillingModel): string | null {
  switch (model) {
    case "hourly":
      return null;
    case "retainer":
      return "retainer";
    case "maintenance":
      return "maintenance plan";
    default:
      return assertNever(model);
  }
}
