import { assertNever } from "@/lib/billing-model";
import type { BillingModel } from "@/lib/db/types";
import { toCents } from "@/lib/format";

export interface BillingFields {
  billing_model: BillingModel;
  hourly_rate?: number | null;
  retainer_amount?: number | null;
  maintenance_monthly?: number | null;
  maintenance_price_6?: number | null;
  maintenance_price_12?: number | null;
}

export interface BillingIssue {
  path:
    | "hourly_rate"
    | "retainer_amount"
    | "maintenance_monthly"
    | "maintenance_price_6"
    | "maintenance_price_12";
  message: string;
}

/**
 * The cross-field rules a project's billing must satisfy. Shared by the create
 * schema (which reports them as field errors) and the update route (which must
 * check the merged row: a PATCH can carry one side of a pair). They mirror the
 * check constraints in 20260901000100_core.sql and
 * 20260928001100_build_and_maintenance.sql, so a violation reaches the operator
 * as a sentence instead of a 500.
 */
export function billingIssues(v: BillingFields): BillingIssue[] {
  switch (v.billing_model) {
    case "hourly":
      return (v.hourly_rate ?? 0) > 0
        ? []
        : [{ path: "hourly_rate", message: "An hourly project needs an hourly rate" }];
    case "retainer":
      return (v.retainer_amount ?? 0) > 0
        ? []
        : [{ path: "retainer_amount", message: "A retainer project needs a retainer amount" }];
    case "maintenance": {
      const monthly = v.maintenance_monthly ?? 0;
      if (!(monthly > 0)) {
        return [{ path: "maintenance_monthly", message: "A maintenance project needs a monthly price" }];
      }
      const issues: BillingIssue[] = [];
      const prepay = [
        [6, v.maintenance_price_6, "maintenance_price_6"],
        [12, v.maintenance_price_12, "maintenance_price_12"],
      ] as const;
      for (const [months, price, path] of prepay) {
        if (price !== null && price !== undefined && toCents(price) > months * toCents(monthly)) {
          issues.push({
            path,
            message: `The ${months}-month price can't be more than ${months} months at the monthly price`,
          });
        }
      }
      return issues;
    }
    default:
      return assertNever(v.billing_model);
  }
}
