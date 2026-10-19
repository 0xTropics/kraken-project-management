import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/card";
import { ClientForm } from "../client-form";
import { requireInternalPage } from "@/lib/auth/internal";

export const metadata: Metadata = { title: "New client" };

export default async function NewClientPage() {
  await requireInternalPage("/app/clients/new");
  return (
    <>
      <PageHeader
        title="New client"
        eyebrow={
          <Link href="/app/clients" className="hover:text-[var(--text-secondary)]">
            Clients
          </Link>
        }
      />
      <div className="mx-auto max-w-[42rem] px-4 py-6 md:px-6">
        <p className="mb-6 max-w-prose text-sm leading-relaxed text-[var(--text-secondary)]">
          A client owns one or more projects and is who every invoice is addressed to.
          Only the name is required — the rest can wait until you send the first invoice.
        </p>
        <ClientForm />
      </div>
    </>
  );
}
