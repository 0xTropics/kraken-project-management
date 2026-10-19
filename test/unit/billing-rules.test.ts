import { describe, expect, it } from "vitest";
import { projectCreateInput } from "@/lib/api/schemas";
import { billingIssues } from "@/lib/projects/billing-rules";

describe("billingIssues", () => {
  it("keeps the hourly and retainer rules", () => {
    expect(billingIssues({ billing_model: "hourly", hourly_rate: null })).toEqual([
      { path: "hourly_rate", message: "An hourly project needs an hourly rate" },
    ]);
    expect(billingIssues({ billing_model: "retainer", retainer_amount: 4000 })).toEqual([]);
  });

  it("needs a monthly price for maintenance", () => {
    expect(billingIssues({ billing_model: "maintenance", maintenance_monthly: null })).toEqual([
      { path: "maintenance_monthly", message: "A maintenance project needs a monthly price" },
    ]);
  });

  it("allows a prepay price up to the full price, to the cent", () => {
    const at = { billing_model: "maintenance" as const, maintenance_monthly: 149.99 };
    expect(billingIssues({ ...at, maintenance_price_6: 899.94 })).toEqual([]);
    expect(billingIssues({ ...at, maintenance_price_6: 899.95 })).toEqual([
      { path: "maintenance_price_6", message: "The 6-month price can't be more than 6 months at the monthly price" },
    ]);
  });

  // Review Focus 1: lowering the monthly price under a prepay price already set
  // must come back as a sentence about the prepay field, not a 500.
  it("flags a prepay price the new, lower monthly price no longer covers", () => {
    expect(
      billingIssues({
        billing_model: "maintenance",
        maintenance_monthly: 100,
        maintenance_price_6: 540,
        maintenance_price_12: 1620,
      }),
    ).toEqual([
      { path: "maintenance_price_12", message: "The 12-month price can't be more than 12 months at the monthly price" },
    ]);
  });
});

describe("projectCreateInput for build + maintenance", () => {
  const body = {
    client_id: "5b0f3c64-0000-4000-8000-000000000001",
    name: "Juniper Dental Website",
    slug: "juniper-site",
    billing_model: "maintenance",
    currency: "CAD",
    portal_password: "correct-horse-battery",
    build_fee: 6000,
    maintenance_monthly: 150,
    maintenance_price_12: 1620,
    maintenance_term_months: 12,
    maintenance_starts_on: "2026-10-01",
  };

  function issuesOf(input: unknown): [string, string][] {
    const result = projectCreateInput.safeParse(input);
    return result.success ? [] : result.error.issues.map((i) => [i.path.join("."), i.message]);
  }

  it("accepts a complete maintenance project", () => {
    expect(issuesOf(body)).toEqual([]);
  });

  it("refuses a start that is not the 1st", () => {
    expect(issuesOf({ ...body, maintenance_starts_on: "2026-10-15" })).toContainEqual([
      "maintenance_starts_on",
      "Maintenance starts on the 1st of a month",
    ]);
  });

  it("refuses a term other than 1, 6 or 12", () => {
    expect(issuesOf({ ...body, maintenance_term_months: 3 })).toContainEqual([
      "maintenance_term_months",
      "Choose monthly, 6 months or 12 months",
    ]);
  });

  it("reports a prepay price above the full price against its own field", () => {
    expect(issuesOf({ ...body, maintenance_price_12: 1800.01 })).toContainEqual([
      "maintenance_price_12",
      "The 12-month price can't be more than 12 months at the monthly price",
    ]);
  });
});
