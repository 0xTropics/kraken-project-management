"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command as CommandPrimitive } from "cmdk";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Inbox,
  Clock,
  FileText,
  Folder,
  LayoutDashboard,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  Users,
} from "lucide-react";
import { billingModelInitial } from "@/lib/billing-model";
import { cn } from "@/lib/cn";
import { useTheme } from "@/components/theme";
import type { NavProject } from "@/lib/data/nav";

/**
 * ⌘K. Jump to a project, jump to a page, or run one of a handful of actions.
 * Deliberately not a search engine over every row -- the value is speed of
 * navigation between projects, which is what actually costs time here.
 */
export function CommandPalette({
  projects,
  open,
  onOpenChange,
}: {
  projects: NavProject[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [search, setSearch] = React.useState("");

  // Clearing on close belongs in the event that closes it, not in an effect
  // that reacts to the close having already happened.
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!next) setSearch("");
      onOpenChange(next);
    },
    [onOpenChange],
  );

  const go = React.useCallback(
    (href: string) => {
      // Navigate first, then close. Closing unmounts the Radix dialog, which
      // restores focus to the trigger; doing that before `push` lets the focus
      // restoration land after the route change and swallow it.
      router.push(href);
      setOpen(false);
    },
    [setOpen, router],
  );

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px] data-[state=open]:animate-[kraken-fade-in_120ms_ease-out]"
        />
        <Dialog.Content
          aria-label="Command palette"
          className={cn(
            "fixed left-1/2 top-[12vh] z-50 w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2",
            "overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border-default)]",
            "bg-[var(--bg-raised)] shadow-[var(--shadow-modal)]",
            "data-[state=open]:animate-[kraken-pop-in_140ms_var(--ease-out-quart)]",
          )}
        >
          <Dialog.Title className="sr-only">Search and commands</Dialog.Title>
          <Dialog.Description className="sr-only">
            Jump to a project or page, or run a command.
          </Dialog.Description>

          <CommandPrimitive
            loop
            className="flex max-h-[min(28rem,70vh)] flex-col"
            filter={(value, query) => {
              if (!query) return 1;
              return value.toLowerCase().includes(query.toLowerCase()) ? 1 : 0;
            }}
          >
            <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-[var(--border-subtle)] px-4">
              <Search className="size-4 shrink-0 text-[var(--text-tertiary)]" />
              <CommandPrimitive.Input
                value={search}
                onValueChange={setSearch}
                placeholder="Jump to a project or run a command…"
                className="h-full flex-1 bg-transparent text-base outline-none placeholder:text-[var(--text-tertiary)]"
              />
              <kbd className="rounded-[var(--radius-xs)] border border-[var(--border-subtle)] px-1.5 py-0.5 text-2xs text-[var(--text-tertiary)]">
                Esc
              </kbd>
            </div>

            <CommandPrimitive.List className="scroll-thin flex-1 overflow-y-auto p-1.5">
              <CommandPrimitive.Empty className="px-3 py-8 text-center text-sm text-[var(--text-tertiary)]">
                Nothing matches “{search}”.
              </CommandPrimitive.Empty>

              <Group heading="Projects">
                {projects.map((project) => (
                  <Item
                    key={project.id}
                    value={`${project.name} ${project.client_name} ${project.slug}`}
                    onSelect={() => go(`/app/projects/${project.slug}`)}
                    icon={
                      <span className="grid size-4 place-items-center rounded-[var(--radius-xs)] bg-[var(--accent-subtle)] text-[10px] font-semibold text-[var(--accent-text)]">
                        {billingModelInitial(project.billing_model)}
                      </span>
                    }
                    hint={project.client_name}
                  >
                    {project.name}
                  </Item>
                ))}
              </Group>

              <Group heading="Go to">
                <Item value="dashboard home" onSelect={() => go("/app")} icon={<LayoutDashboard />}>
                  Dashboard
                </Item>
                <Item value="client requests inbox" onSelect={() => go("/app/requests")} icon={<Inbox />}>
                  Client requests
                </Item>
                <Item value="time entries hours" onSelect={() => go("/app/time")} icon={<Clock />}>
                  Time
                </Item>
                <Item value="invoices billing" onSelect={() => go("/app/invoices")} icon={<FileText />}>
                  Invoices
                </Item>
                <Item value="reports revenue utilization" onSelect={() => go("/app/reports")} icon={<LayoutDashboard />}>
                  Reports
                </Item>
                <Item value="clients" onSelect={() => go("/app/clients")} icon={<Users />}>
                  Clients
                </Item>
                <Item value="all projects list" onSelect={() => go("/app/projects")} icon={<Folder />}>
                  All projects
                </Item>
                <Item value="settings audit" onSelect={() => go("/app/settings")} icon={<Settings />}>
                  Settings
                </Item>
              </Group>

              <Group heading="Create">
                <Item value="new project create" onSelect={() => go("/app/projects/new")} icon={<Plus />}>
                  New project
                </Item>
                <Item value="log time new entry" onSelect={() => go("/app/time/new")} icon={<Plus />}>
                  Log time
                </Item>
                <Item value="new client create" onSelect={() => go("/app/clients/new")} icon={<Plus />}>
                  New client
                </Item>
              </Group>

              <Group heading="Theme">
                <Item
                  value="light theme"
                  onSelect={() => {
                    setTheme("light");
                    setOpen(false);
                  }}
                  icon={<Sun />}
                >
                  Light
                </Item>
                <Item
                  value="dark theme"
                  onSelect={() => {
                    setTheme("dark");
                    setOpen(false);
                  }}
                  icon={<Moon />}
                >
                  Dark
                </Item>
              </Group>
            </CommandPrimitive.List>
          </CommandPrimitive>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Group({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <CommandPrimitive.Group
      heading={heading}
      className={cn(
        "[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2.5",
        "[&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold",
        "[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.06em]",
        "[&_[cmdk-group-heading]]:text-[var(--text-tertiary)]",
      )}
    >
      {children}
    </CommandPrimitive.Group>
  );
}

function Item({
  value,
  onSelect,
  icon,
  hint,
  children,
}: {
  value: string;
  onSelect: () => void;
  icon: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <CommandPrimitive.Item
      value={value}
      onSelect={onSelect}
      className={cn(
        "flex h-8 cursor-pointer select-none items-center gap-2.5 rounded-[var(--radius-md)] px-2.5",
        "text-base text-[var(--text-secondary)]",
        "data-[selected=true]:bg-[var(--bg-active)] data-[selected=true]:text-[var(--text-primary)]",
        "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:opacity-70",
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
      {hint && (
        <span className="ml-auto truncate pl-3 text-xs text-[var(--text-tertiary)]">{hint}</span>
      )}
    </CommandPrimitive.Item>
  );
}
