import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Ban, Clock, Eye, EyeOff } from "lucide-react";
import { Badge, INVOICE_STATUS_META } from "@/components/ui/badge";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { DraftEditor } from "@/components/invoices/draft-editor";
import { InvoiceActions } from "@/components/invoices/invoice-actions";
import { InvoiceDocument } from "@/components/invoices/invoice-document";
import { TimeEntryTable } from "@/components/invoices/time-entry-table";
import { UUID_RE } from "@/lib/api/schemas";
import { listUnbilledCharges } from "@/lib/data/charges";
import { getDepositBalance } from "@/lib/data/deposits";
import { getInvoiceDetail } from "@/lib/data/invoices";
import { env } from "@/lib/env";
import { formatDate, formatDateTime } from "@/lib/format";
import { requireInternalPage } from "@/lib/auth/internal";

async function load(id: string) {
  if (!UUID_RE.test(id)) notFound();
  const invoice = await getInvoiceDetail(id);
  if (!invoice) notFound();
  return invoice;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  await requireInternalPage();
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Invoice" };
  const invoice = await getInvoiceDetail(id);
  return { title: invoice?.number ? `Invoice ${invoice.number}` : "Draft invoice" };
}

/**
 * The money screen. A draft is an editor; anything finalized is a document.
 *
 * The split is deliberate and total — there is no shared "form that happens to
 * be read-only", because a finalized invoice is immutable and a
 * greyed-out input would misrepresent that as temporary.
 */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requireInternalPage();
  const { id } = await params;
  const invoice = await load(id);

  if (invoice.status === "draft") {
    const [unbilledCharges, depositBalance] = await Promise.all([
      listUnbilledCharges(invoice.project_id),
      getDepositBalance(invoice.project_id),
    ]);
    return (
      <DraftEditor
        invoice={invoice}
        unbilledCharges={unbilledCharges}
        depositBalance={depositBalance}
      >
        <TimeEntryTable entries={invoice.time_entries} draft />
      </DraftEditor>
    );
  }

  const meta = INVOICE_STATUS_META[invoice.status];
  const isVoid = invoice.status === "void";
  const published = Boolean(invoice.published_at);

  const timeline: { label: string; value: string | null }[] = [
    { label: "Finalized", value: invoice.finalized_at },
    { label: "Paid", value: invoice.paid_at },
    { label: "Published", value: invoice.published_at },
    { label: "Voided", value: invoice.voided_at },
  ];

  return (
    <>
      <PageHeader
        title={`Invoice ${invoice.number}`}
        eyebrow={
          <Link
            href={`/app/projects/${invoice.project.slug}/invoices`}
            className="truncate hover:text-[var(--text-secondary)]"
          >
            {invoice.project.name}
          </Link>
        }
        actions={
          <>
            <Badge tone={meta.tone} className="hidden sm:inline-flex">
              {meta.label}
            </Badge>
            <InvoiceActions
              invoiceId={invoice.id}
              number={invoice.number}
              status={invoice.status}
              published={published}
              currency={invoice.currency}
              total={invoice.total}
              periodStart={invoice.period_start}
              periodEnd={invoice.period_end}
              timeEntryCount={invoice.time_entries.length}
            />
          </>
        }
      />

      <div className="mx-auto max-w-[60rem] space-y-5 px-4 py-6 md:px-6">
        {isVoid && (
          <div className="flex items-start gap-2.5 rounded-[var(--radius-lg)] border border-[var(--danger)] bg-[var(--danger-subtle)] px-4 py-3">
            <Ban className="mt-0.5 size-4 shrink-0 text-[var(--danger-text)]" />
            <div className="min-w-0 text-sm">
              <p className="font-medium text-[var(--danger-text)]">
                This invoice was voided {formatDateTime(invoice.voided_at)}.
              </p>
              <p className="mt-0.5 leading-relaxed text-[var(--text-secondary)]">
                Its time entries were released back to unbilled and it is no longer visible in the
                portal. The number{" "}
                <span className="tabular-nums text-[var(--text-primary)]">{invoice.number}</span> is
                retired and will never be reissued.
              </p>
            </div>
          </div>
        )}

        {!isVoid && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] px-4 py-2.5 text-xs">
            {timeline
              .filter((entry) => entry.value)
              .map((entry) => (
                <span key={entry.label} className="text-[var(--text-tertiary)]">
                  {entry.label}{" "}
                  <span className="tabular-nums text-[var(--text-secondary)]">
                    {formatDateTime(entry.value)}
                  </span>
                </span>
              ))}
            <span className="ml-auto flex items-center gap-1.5">
              {published ? (
                <>
                  <Eye className="size-3.5 text-[var(--accent-text)]" />
                  <span className="text-[var(--accent-text)]">Visible in the client portal</span>
                </>
              ) : (
                <>
                  <EyeOff className="size-3.5 text-[var(--text-tertiary)]" />
                  <span className="text-[var(--text-tertiary)]">Not published to the portal</span>
                </>
              )}
            </span>
          </div>
        )}

        <InvoiceDocument
          invoice={invoice}
          company={{
            name: env.companyName,
            email: env.companyEmail,
            address: env.companyAddress,
          }}
        />

        <Card>
          <CardHeader
            title="Time on this invoice"
            description={
              isVoid
                ? "Released when the invoice was voided — these hours are unbilled again."
                : `Locked to this invoice and read-only. ${formatDate(invoice.period_start)} – ${formatDate(invoice.period_end)}.`
            }
            action={
              <span className="flex items-center gap-1.5 text-2xs text-[var(--text-tertiary)]">
                <Clock className="size-3.5" />
                Reference only
              </span>
            }
          />
          <TimeEntryTable entries={invoice.time_entries} draft={false} />
        </Card>
      </div>
    </>
  );
}
