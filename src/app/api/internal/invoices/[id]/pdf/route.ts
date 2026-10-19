import { NextResponse } from "next/server";
import { internalHandler } from "@/lib/api/handler";
import { ensureInvoicePdf } from "@/lib/pdf/ensure";
import { storage } from "@/lib/storage";
import { getInvoiceDetail } from "@/lib/data/invoices";
import { notFound } from "@/lib/errors";

/** Streams the document inline so the browser's PDF viewer can show it. */
export const GET = internalHandler<{ id: string }>(async ({ params }) => {
  const invoice = await getInvoiceDetail(params.id);
  if (!invoice) throw notFound("Invoice not found");

  const objectPath = await ensureInvoicePdf(params.id);
  const bytes = await storage().get(objectPath);
  if (!bytes) throw notFound("The document could not be produced");

  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${invoice.number ?? "invoice"}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
});
