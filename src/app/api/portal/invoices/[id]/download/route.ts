import { NextResponse } from "next/server";
import { publicHandler } from "@/lib/api/handler";
import { getPortalInvoiceDownloadUrl, portalScope } from "@/lib/data/portal";
import { ensureInvoicePdf } from "@/lib/pdf/ensure";
import { notFound } from "@/lib/errors";
import { sql } from "@/lib/db/client";

/**
 * The invoice id arrives from the request, so it is untrusted. It is resolved
 * only through the portal data module, which matches it against the cookie's
 * project *and* the published filter in one statement — so an id belonging to
 * another client, an unpublished invoice, and a nonexistent id are all the same
 * 404.
 */
export const GET = publicHandler<{ id: string }>(async ({ params }) => {
  const scope = await portalScope();
  if (!scope) throw notFound();

  // Confirm the invoice is in scope and published before doing any work.
  const [visible] = await sql<{ id: string }[]>`
    select id from invoices
    where id = ${params.id}
      and project_id = ${scope.projectId}
      and published_at is not null
      and status in ('sent','paid')
  `;
  if (!visible) throw notFound();

  // Repair a missing document rather than 404 on an invoice the client can see.
  await ensureInvoicePdf(params.id).catch(() => undefined);

  const url = await getPortalInvoiceDownloadUrl(scope, params.id);
  if (!url) throw notFound();
  return NextResponse.redirect(url, 302);
});
