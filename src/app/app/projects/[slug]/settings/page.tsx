import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SettingsForm } from "@/components/projects/settings-form";
import { PortalAccessCard } from "@/components/projects/portal-access-card";
import { DepositsPanel } from "@/components/projects/deposits-panel";
import { ChargesPanel } from "@/components/projects/charges-panel";
import { ArchiveCard } from "@/components/projects/archive-card";
import { getProjectBySlug } from "@/lib/data/projects";
import { getDepositBalance, listProjectDeposits } from "@/lib/data/deposits";
import { listProjectCharges } from "@/lib/data/charges";
import { env } from "@/lib/env";
import { requireInternalPage } from "@/lib/auth/internal";

export const metadata: Metadata = { title: "Settings" };

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireInternalPage();
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  const [deposits, depositBalance, charges] = await Promise.all([
    listProjectDeposits(project.id),
    getDepositBalance(project.id),
    listProjectCharges(project.id),
  ]);

  return (
    <div className="mx-auto max-w-[46rem] space-y-10 px-4 py-6 pb-16 md:px-6">
      <SettingsForm key={project.updated_at} project={project} />

      <DepositsPanel
        projectId={project.id}
        currency={project.currency}
        deposits={deposits}
        balance={depositBalance}
      />

      <ChargesPanel projectId={project.id} currency={project.currency} charges={charges} />

      <PortalAccessCard
        projectId={project.id}
        portalUrl={`${env.appUrl}/portal/${project.slug}`}
        passwordVersion={project.portal_password_version}
      />

      <ArchiveCard
        projectId={project.id}
        projectName={project.name}
        archived={project.archived_at !== null}
      />
    </div>
  );
}
