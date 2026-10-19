import { PageHeader } from "@/components/ui/card";
import { TabNav } from "@/components/ui/tab-nav";
import { requireInternalPage } from "@/lib/auth/internal";

/**
 * Settings owns two surfaces: the workspace overview and the audit log. The
 * chrome lives here so each page starts at its own content.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireInternalPage();
  return (
    <>
      <PageHeader title="Settings">
        <TabNav
          label="Settings sections"
          tabs={[
            { label: "Overview", href: "/app/settings" },
            { label: "Audit log", href: "/app/settings/audit" },
          ]}
        />
      </PageHeader>
      {children}
    </>
  );
}
