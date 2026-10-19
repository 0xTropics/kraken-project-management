"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, PanelLeftOpen, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { usePersistedState } from "@/lib/use-persisted-state";
import { Wordmark } from "./wordmark";
import { SidebarContent } from "./sidebar";
import { CommandPalette } from "./command-palette";
import type { NavProject } from "@/lib/data/nav";

export function AppShell({
  projects,
  requestCount,
  email,
  children,
}: {
  projects: NavProject[];
  requestCount: number;
  email: string;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [collapsedPref, setCollapsedPref] = usePersistedState<"0" | "1">(
    "kraken-sidebar-collapsed",
    "0",
  );
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const collapsed = collapsedPref === "1";

  const toggleCollapsed = React.useCallback(
    () => setCollapsedPref(collapsed ? "0" : "1"),
    [collapsed, setCollapsedPref],
  );

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
      // `\` toggles the sidebar, matching Notion.
      if (event.key === "\\" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggleCollapsed();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleCollapsed]);

  return (
    <div className="flex min-h-dvh bg-[var(--bg-app)]">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden shrink-0 border-r border-[var(--border-subtle)] md:block",
          "transition-[width] duration-200 ease-[var(--ease-out-quart)]",
          collapsed ? "w-0 overflow-hidden" : "w-60",
        )}
      >
        <div className="sticky top-0 h-dvh w-60">
          <SidebarContent
            projects={projects}
            requestCount={requestCount}
            email={email}
            onOpenPalette={() => setPaletteOpen(true)}
            onCollapse={toggleCollapsed}
          />
        </div>
      </aside>

      {/* Mobile drawer */}
      <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 md:hidden data-[state=open]:animate-[kraken-fade-in_150ms_ease-out]" />
          <Dialog.Content
            className={cn(
              "fixed inset-y-0 left-0 z-50 w-[17rem] border-r border-[var(--border-subtle)] md:hidden",
              "data-[state=open]:animate-[kraken-slide-up_180ms_var(--ease-out-quart)]",
            )}
          >
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>
            <SidebarContent
              projects={projects}
              requestCount={requestCount}
              email={email}
              onNavigate={() => setMobileOpen(false)}
              onOpenPalette={() => {
                setMobileOpen(false);
                setPaletteOpen(true);
              }}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <div className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-1 border-b border-[var(--border-subtle)] bg-[var(--bg-app)]/90 px-2 backdrop-blur-md md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="grid size-9 place-items-center rounded-[var(--radius-md)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
          >
            <Menu className="size-4.5" />
          </button>
          <Wordmark className="flex-1" />
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label="Search"
            className="grid size-9 place-items-center rounded-[var(--radius-md)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
          >
            <Search className="size-4.5" />
          </button>
        </div>

        {collapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Expand sidebar"
            className="fixed left-2 top-2.5 z-40 hidden size-7 place-items-center rounded-[var(--radius-sm)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] md:grid"
          >
            <PanelLeftOpen className="size-4" />
          </button>
        )}

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <CommandPalette projects={projects} open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
