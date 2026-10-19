/**
 * Renders seeded invoices to docs/evidence/current/ so the document can be
 * inspected as a document, not as a screenshot of a screen that resembles one.
 *
 *   npx tsx --env-file-if-exists=.env.local scripts/dev/render-invoice-sample.ts
 *
 * Three samples, because the interesting cases are the ones with something to
 * get wrong: a no-tax hourly invoice carrying a goodwill credit, a taxed
 * retainer in a second currency, and a void.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { sql } from "@/lib/db/client";
import { getInvoicePdfPayload } from "@/lib/data/invoices";
import { renderInvoicePdf } from "@/lib/pdf/invoice-pdf";

const OUT = path.resolve(process.env.OUT ?? "docs/evidence/current");

const SAMPLES: { file: string; pick: string }[] = [
  // Hourly, nine lines, a goodwill credit, no tax -- the common case.
  { file: "invoice-sample.pdf", pick: "sent" },
  // Retainer, CAD, 5% tax, paid -- proves the tax line and the PAID stamp.
  { file: "invoice-sample-tax.pdf", pick: "paid-taxed" },
  // Void -- proves the stamp and that a retired number still prints.
  { file: "invoice-sample-void.pdf", pick: "void" },
];

async function idFor(pick: string): Promise<string | null> {
  if (pick === "paid-taxed") {
    const [row] = await sql<{ id: string }[]>`
      select id from invoices where status = 'paid' and tax_rate > 0
      order by number desc limit 1
    `;
    return row?.id ?? null;
  }
  const [row] = await sql<{ id: string }[]>`
    select i.id from invoices i
    where i.status = ${pick}
    order by (select count(*) from invoice_lines l where l.invoice_id = i.id) desc,
             i.number desc
    limit 1
  `;
  return row?.id ?? null;
}

async function main() {
  await mkdir(OUT, { recursive: true });

  for (const sample of SAMPLES) {
    const id = await idFor(sample.pick);
    if (!id) {
      console.warn(`  skipped ${sample.file}: no seeded invoice matches "${sample.pick}"`);
      continue;
    }
    const payload = await getInvoicePdfPayload(id);
    if (!payload) {
      console.warn(`  skipped ${sample.file}: invoice ${id} has no payload`);
      continue;
    }
    const bytes = await renderInvoicePdf(payload.data, payload.lines);
    const target = path.join(OUT, sample.file);
    await writeFile(target, bytes);
    console.log(
      `  ${sample.file}  ${payload.number ?? "DRAFT"}  ${payload.lines.length} lines  ` +
        `${(bytes.byteLength / 1024).toFixed(1)} kB`,
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error("Rendering failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => sql.end({ timeout: 5 }));
