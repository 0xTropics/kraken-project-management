import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "@/lib/db/client";
import { createProject, resetDatabase } from "../setup/factories";
import { getClientTotals } from "@/lib/data/clients";
import { getProjectStats } from "@/lib/data/projects";

/**
 * "Outstanding" means what is still owed, not the face value of the invoice.
 * A deposit already collected against the project reduces the debt even
 * though the invoice's own `total` never changes.
 */

beforeEach(resetDatabase);

describe("amount due nets out the deposit applied", () => {
  it("reports outstanding net of deposit_applied, not the gross total", async () => {
    const project = await createProject({ billing_model: "hourly", hourly_rate: 100 });

    await sql`
      insert into invoices (project_id, number, status, period_start, period_end,
                            currency, subtotal, tax_amount, total, deposit_applied,
                            finalized_at, sent_at)
      values (${project.id}, '2026-001', 'sent', '2026-03-01', '2026-03-31',
              'USD', 1000, 0, 1000, 400, now(), now())
    `;

    const [totals] = await getClientTotals(project.client_id);
    expect(totals?.outstanding).toBe(600);
    expect(totals?.invoiced).toBe(1000);
  });

  it("reports the project page's outstanding_total net of deposit_applied too", async () => {
    // Another site that computes outstanding --
    // this must agree with getClientTotals above, or the project page and
    // the clients page show two different numbers for the same invoice.
    const project = await createProject({ billing_model: "hourly", hourly_rate: 100 });

    await sql`
      insert into invoices (project_id, number, status, period_start, period_end,
                            currency, subtotal, tax_amount, total, deposit_applied,
                            finalized_at, sent_at)
      values (${project.id}, '2026-002', 'sent', '2026-03-01', '2026-03-31',
              'USD', 1000, 0, 1000, 400, now(), now())
    `;

    const stats = await getProjectStats(project.id);
    expect(stats.outstanding_total).toBe(600);
  });
});
