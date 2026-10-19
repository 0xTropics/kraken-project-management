"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  Command,
  FileText,
  Folder,
  Inbox,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  Plus,
  ScrollText,
  Search,
  Settings,
  Users,
} from "lucide-react";
import { billingModelInitial, billingModelLabel } from "@/lib/billing-model";
import { cn } from "@/lib/cn";
import { ThemeToggle } from "@/components/theme";
import { KrakenMark } from "@/components/app-shell/kraken-mark";
import type { NavProject } from "@/lib/data/nav";

function NavLink({
  href,
  icon: Icon,
  children,
  badge,
  exact,
  onNavigate,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  badge?: number;
  exact?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-7 items-center gap-2 rounded-[var(--radius-sm)] px-2 text-sm",
        "transition-colors duration-100",
        active
          ? "bg-[var(--bg-active)] font-medium text-[var(--text-primary)]"
          : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]",
      )}
    >
      <Icon className="size-4 shrink-0 opacity-80" />
      <span className="truncate">{children}</span>
      {badge !== undefined && badge > 0 && (
        <span className="ml-auto rounded-full bg-[var(--accent-subtle)] px-1.5 text-2xs font-semibold tabular-nums text-[var(--accent-text)]">
          {badge}
        </span>
      )}
    </Link>
  );
}

export function SidebarContent({
  projects,
  requestCount,
  email,
  onNavigate,
  onOpenPalette,
  onCollapse,
}: {
  projects: NavProject[];
  requestCount: number;
  email: string;
  onNavigate?: () => void;
  onOpenPalette: () => void;
  onCollapse?: () => void;
}) {
  const router = useRouter();
  const [projectsOpen, setProjectsOpen] = React.useState(true);
  const pathname = usePathname();

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col bg-[var(--bg-sunken)]">
      {/* Workspace row */}
      <div className="flex h-12 shrink-0 items-center gap-2 px-3">
        <Link
          href="/app"
          onClick={onNavigate}
          aria-label="Kraken home"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 hover:bg-[var(--bg-hover)]"
        >
          {/* The mark is aria-hidden, so the link carries its own name. */}
          <KrakenMark className="size-5 shrink-0" />
        </Link>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Collapse sidebar"
            className="hidden size-6 place-items-center rounded-[var(--radius-sm)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] md:grid"
          >
            <PanelLeftClose className="size-4" />
          </button>
        )}
      </div>

      {/* Search / palette trigger */}
      <div className="px-3 pb-2">
        <button
          type="button"
          onClick={onOpenPalette}
          className={cn(
            "flex h-7 w-full items-center gap-2 rounded-[var(--radius-sm)] px-2",
            "text-sm text-[var(--text-tertiary)]",
            "hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]",
            "transition-colors duration-100",
          )}
        >
          <Search className="size-4" />
          <span>Search</span>
          <kbd className="ml-auto flex items-center gap-0.5 rounded-[var(--radius-xs)] border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-1 py-px font-sans text-2xs text-[var(--text-tertiary)]">
            <Command className="size-2.5" />K
          </kbd>
        </button>
      </div>

      <nav className="scroll-thin flex-1 overflow-y-auto px-3 pb-2">
        <div className="space-y-px">
          <NavLink href="/app" icon={LayoutDashboard} exact onNavigate={onNavigate}>
            Dashboard
          </NavLink>
          <NavLink href="/app/requests" icon={Inbox} badge={requestCount} onNavigate={onNavigate}>
            Requests
          </NavLink>
          <NavLink href="/app/time" icon={ScrollText} onNavigate={onNavigate}>
            Time
          </NavLink>
          <NavLink href="/app/invoices" icon={FileText} onNavigate={onNavigate}>
            Invoices
          </NavLink>
          <NavLink href="/app/reports" icon={LayoutDashboard} onNavigate={onNavigate}>
            Reports
          </NavLink>
          <NavLink href="/app/clients" icon={Users} onNavigate={onNavigate}>
            Clients
          </NavLink>
        </div>

        <div className="mt-5">
          <div className="flex items-center gap-1 px-2">
            <button
              type="button"
              onClick={() => setProjectsOpen((v) => !v)}
              aria-expanded={projectsOpen}
              className="group flex flex-1 items-center gap-1 py-1 text-2xs font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            >
              <ChevronDown
                className={cn(
                  "size-3 transition-transform duration-150",
                  !projectsOpen && "-rotate-90",
                )}
              />
              Projects
            </button>
            <Link
              href="/app/projects/new"
              onClick={onNavigate}
              aria-label="New project"
              title="New project"
              className="grid size-5 place-items-center rounded-[var(--radius-xs)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <Plus className="size-3.5" />
            </Link>
          </div>

          {projectsOpen && (
            <div className="mt-0.5 space-y-px">
              {projects.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-[var(--text-tertiary)]">
                  No projects yet.
                </p>
              )}
              {projects.map((project) => {
                const href = `/app/projects/${project.slug}`;
                const active = pathname.startsWith(href);
                return (
                  <Link
                    key={project.id}
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex h-7 items-center gap-2 rounded-[var(--radius-sm)] px-2 text-sm",
                      "transition-colors duration-100",
                      active
                        ? "bg-[var(--bg-active)] font-medium text-[var(--text-primary)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]",
                    )}
                  >
                    <span
                      title={billingModelLabel(project.billing_model)}
                      className={cn(
                        "grid size-4 shrink-0 place-items-center rounded-[var(--radius-xs)] text-[10px] font-semibold",
                        project.status === "active"
                          ? "bg-[var(--accent-subtle)] text-[var(--accent-text)]"
                          : "bg-[var(--bg-inset)] text-[var(--text-tertiary)]",
                      )}
                    >
                      {billingModelInitial(project.billing_model)}
                    </span>
                    <span className="truncate">{project.name}</span>
                    {project.open_items > 0 && (
                      <span className="ml-auto text-2xs tabular-nums text-[var(--text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100">
                        {project.open_items}
                      </span>
                    )}
                  </Link>
                );
              })}
              <Link
                href="/app/projects"
                onClick={onNavigate}
                className="flex h-7 items-center gap-2 rounded-[var(--radius-sm)] px-2 text-sm text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
              >
                <Folder className="size-4 opacity-70" />
                All projects
              </Link>
            </div>
          )}
        </div>
      </nav>

      <div className="shrink-0 border-t border-[var(--border-subtle)] p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <ThemeToggle />
          <div className="flex items-center gap-0.5">
            <Link
              href="/app/settings"
              onClick={onNavigate}
              aria-label="Settings"
              title="Settings"
              className="grid size-6 place-items-center rounded-[var(--radius-sm)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <Settings className="size-3.5" />
            </Link>
            <button
              type="button"
              onClick={signOut}
              aria-label="Sign out"
              title="Sign out"
              className="grid size-6 place-items-center rounded-[var(--radius-sm)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <LogOut className="size-3.5" />
            </button>
          </div>
        </div>
        <p className="truncate px-0.5 text-2xs text-[var(--text-tertiary)]" title={email}>
          {email}
        </p>
      </div>
    </div>
  );
}
