import { rm } from "node:fs/promises";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "@/lib/db/client";
import { getInvoicePdfPayload } from "@/lib/data/invoices";
import { createDraftInvoice, createMaintenanceDraft, finalizeInvoice } from "@/lib/invoices/engine";
import { ensureInvoicePdf } from "@/lib/pdf/ensure";
import { renderInvoicePdf } from "@/lib/pdf/invoice-pdf";
import {
  invoicePdfPath,
  signObjectPath,
  storage,
  verifyObjectSignature,
} from "@/lib/storage";
import {
  createInternalUser,
  createProject,
  createTimeEntry,
  resetDatabase,
} from "../setup/factories";

/**
 * The document half of invoicing: that a real PDF comes out, that it survives
 * a round trip through the storage adapter, and that the signed URL protecting
 * it actually refuses a forged or stale request.
 */

let actorId: string;

beforeEach(async () => {
  await resetDatabase();
  actorId = (await createInternalUser()).id;
});

afterAll(async () => {
  await rm(process.env.KRAKEN_LOCAL_STORAGE_DIR ?? ".storage-test", {
    recursive: true,
    force: true,
  });
});

async function finalizedInvoice() {
  const project = await createProject({
    name: "Greenhouse Ops",
    billing_model: "hourly",
    hourly_rate: 150,
    tax_rate: 0.05,
  });
  await createTimeEntry(project.id, {
    date: "2026-03-11",
    hours_worked: 6.5,
    hours_billed: 5.25,
    discount_reason: "Rework on my own bug",
    description: "Scheduler rewrite",
  });
  const draft = await createDraftInvoice({
    projectId: project.id,
    periodStart: "2026-03-01",
    periodEnd: "2026-03-31",
    actorId,
  });
  const { invoice } = await finalizeInvoice(draft.id, actorId);
  return { projectId: project.id, invoiceId: invoice.id, number: invoice.number! };
}

/* -------------------------------------------------------------------------- */

describe("renderInvoicePdf", () => {
  it("produces a PDF", async () => {
    const { invoiceId } = await finalizedInvoice();
    const payload = await getInvoicePdfPayload(invoiceId);
    expect(payload).not.toBeNull();

    const bytes = await renderInvoicePdf(payload!.data, payload!.lines);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    // A PDF is only complete once the trailer is written.
    expect(Buffer.from(bytes).toString("latin1")).toContain("%%EOF");
  });

  it("renders a draft, a discount line, and a zero-tax invoice without throwing", async () => {
    const project = await createProject({ billing_model: "retainer", retainer_amount: 4000 });
    const draft = await createDraftInvoice({
      projectId: project.id,
      periodStart: "2026-03-01",
      periodEnd: "2026-03-31",
      actorId,
    });
    const payload = await getInvoicePdfPayload(draft.id);
    const bytes = await renderInvoicePdf(payload!.data, payload!.lines);
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
  });

  it("renders a build + maintenance invoice without throwing", async () => {
    const project = await createProject({
      billing_model: "maintenance",
      maintenance_monthly: 150,
      maintenance_price_12: 1620,
      maintenance_term_months: 12,
      maintenance_starts_on: "2026-10-01",
      tax_rate: 0.13,
    });
    const draft = await createMaintenanceDraft(project.id, actorId);
    const payload = await getInvoicePdfPayload(draft.id);
    const bytes = await renderInvoicePdf(payload!.data, payload!.lines);
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
  });
});

/* -------------------------------------------------------------------------- */

describe("the local storage adapter", () => {
  it("round-trips the bytes it was given", async () => {
    const { invoiceId } = await finalizedInvoice();
    const payload = await getInvoicePdfPayload(invoiceId);
    const bytes = await renderInvoicePdf(payload!.data, payload!.lines);

    const objectPath = invoicePdfPath(payload!.projectId, payload!.number!);
    await storage().put(objectPath, bytes, "application/pdf");

    const readBack = await storage().get(objectPath);
    expect(readBack).not.toBeNull();
    expect(readBack!.byteLength).toBe(bytes.byteLength);
    expect(Buffer.from(readBack!).equals(Buffer.from(bytes))).toBe(true);
  });

  it("returns null for an object that is not there", async () => {
    expect(await storage().get("invoices/nobody/2026-999.pdf")).toBeNull();
  });

  it("refuses to touch anything outside the storage root", async () => {
    // `get` is deliberately forgiving and answers null for anything it cannot
    // read, traversal included; `put` refuses loudly, because a write outside
    // the root is never a missing file, it is an attack.
    expect(await storage().get("../../etc/passwd")).toBeNull();
    await expect(
      storage().put("../escape.pdf", new Uint8Array([1]), "application/pdf"),
    ).rejects.toThrow(/storage root/i);
  });

  it("is what ensureInvoicePdf writes, at the invoices/<project>/<number>.pdf path", async () => {
    const { invoiceId, projectId, number } = await finalizedInvoice();
    const objectPath = await ensureInvoicePdf(invoiceId);
    expect(objectPath).toBe(`invoices/${projectId}/${number}.pdf`);

    const stored = await storage().get(objectPath);
    expect(Buffer.from(stored!.subarray(0, 5)).toString("latin1")).toBe("%PDF-");

    // The path is recorded on the invoice, and recording it is idempotent:
    // asking again after the document exists must not fail.
    const [row] = await sql<{ pdf_path: string | null }[]>`
      select pdf_path from invoices where id = ${invoiceId}
    `;
    expect(row.pdf_path).toBe(objectPath);
    expect(await ensureInvoicePdf(invoiceId)).toBe(objectPath);
  });

  it("refuses to swap the document under a number that has gone out", async () => {
    const { invoiceId } = await finalizedInvoice();
    await ensureInvoicePdf(invoiceId);
    await expect(
      sql`update invoices set pdf_path = 'invoices/elsewhere/2026-001.pdf' where id = ${invoiceId}`,
    ).rejects.toThrow(/invoice_immutable/);
  });
});

/* -------------------------------------------------------------------------- */

describe("verifyObjectSignature", () => {
  const objectPath = "invoices/11111111-1111-1111-1111-111111111111/2026-001.pdf";

  it("accepts a signature it just produced", () => {
    const expires = Math.floor(Date.now() / 1000) + 120;
    expect(verifyObjectSignature(objectPath, expires, signObjectPath(objectPath, expires))).toBe(
      true,
    );
  });

  it("rejects a tampered path", () => {
    const expires = Math.floor(Date.now() / 1000) + 120;
    const signature = signObjectPath(objectPath, expires);
    expect(
      verifyObjectSignature(
        "invoices/22222222-2222-2222-2222-222222222222/2026-001.pdf",
        expires,
        signature,
      ),
    ).toBe(false);
  });

  it("rejects an expired timestamp, even with its own valid signature", () => {
    const expired = Math.floor(Date.now() / 1000) - 1;
    expect(verifyObjectSignature(objectPath, expired, signObjectPath(objectPath, expired))).toBe(
      false,
    );
  });

  it("rejects a stretched expiry, a garbage signature, and a non-finite one", () => {
    const expires = Math.floor(Date.now() / 1000) + 120;
    const signature = signObjectPath(objectPath, expires);
    expect(verifyObjectSignature(objectPath, expires + 86_400, signature)).toBe(false);
    expect(verifyObjectSignature(objectPath, expires, "00".repeat(32))).toBe(false);
    expect(verifyObjectSignature(objectPath, expires, "not-hex")).toBe(false);
    expect(verifyObjectSignature(objectPath, Number.NaN, signature)).toBe(false);
  });
});
