import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Project", template: "%s" },
  robots: { index: false, follow: false, nocache: true },
};

/**
 * The portal's own shell. Deliberately empty of chrome: no sidebar, no command
 * palette, no theme switcher. It follows the system colour scheme and gets out
 * of the way.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-[var(--bg-app)]">{children}</div>;
}
