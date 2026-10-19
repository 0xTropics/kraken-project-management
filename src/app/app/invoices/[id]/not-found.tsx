import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export default function InvoiceNotFound() {
  return (
    <>
      <PageHeader title="Invoice" />
      <div className="mx-auto max-w-[60rem] px-4 py-6 md:px-6">
        <EmptyState
          icon={FileQuestion}
          title="No such invoice"
          description="It may have been a draft that was deleted. Finalized invoices are never removed, so anything with a number is still in the list."
          action={
            <Button asChild variant="primary" size="md">
              <Link href="/app/invoices">All invoices</Link>
            </Button>
          }
        />
      </div>
    </>
  );
}
