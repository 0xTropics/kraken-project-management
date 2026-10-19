"use client";

import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

const SURFACE =
  "z-50 min-w-[11rem] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-default)] " +
  "bg-[var(--bg-raised)] p-1 shadow-[var(--shadow-menu)] " +
  "data-[state=open]:animate-[kraken-pop-in_120ms_var(--ease-out-quart)]";

export function MenuContent({
  className,
  sideOffset = 6,
  align = "start",
  ...props
}: React.ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(SURFACE, className)}
        {...props}
      />
    </DropdownMenu.Portal>
  );
}

const ITEM =
  "flex h-7 cursor-pointer select-none items-center gap-2 rounded-[var(--radius-sm)] px-2 " +
  "text-sm text-[var(--text-secondary)] outline-none " +
  "data-[highlighted]:bg-[var(--bg-hover)] data-[highlighted]:text-[var(--text-primary)] " +
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-45 " +
  "[&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:opacity-80";

export function MenuItem({
  className,
  destructive,
  ...props
}: React.ComponentProps<typeof DropdownMenu.Item> & { destructive?: boolean }) {
  return (
    <DropdownMenu.Item
      className={cn(
        ITEM,
        destructive &&
          "text-[var(--danger)] data-[highlighted]:bg-[var(--danger-subtle)] data-[highlighted]:text-[var(--danger)]",
        className,
      )}
      {...props}
    />
  );
}

export function MenuCheckboxItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenu.CheckboxItem>) {
  return (
    <DropdownMenu.CheckboxItem className={cn(ITEM, "pl-7 relative", className)} {...props}>
      <DropdownMenu.ItemIndicator className="absolute left-2 grid place-items-center">
        <Check className="size-3.5 text-[var(--accent-text)]" />
      </DropdownMenu.ItemIndicator>
      {children}
    </DropdownMenu.CheckboxItem>
  );
}

export function MenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenu.RadioItem>) {
  return (
    <DropdownMenu.RadioItem className={cn(ITEM, "pl-7 relative", className)} {...props}>
      <DropdownMenu.ItemIndicator className="absolute left-2 grid place-items-center">
        <Check className="size-3.5 text-[var(--accent-text)]" />
      </DropdownMenu.ItemIndicator>
      {children}
    </DropdownMenu.RadioItem>
  );
}

export const MenuRadioGroup = DropdownMenu.RadioGroup;

export function MenuLabel({ className, ...props }: React.ComponentProps<typeof DropdownMenu.Label>) {
  return (
    <DropdownMenu.Label
      className={cn(
        "px-2 pb-1 pt-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)]",
        className,
      )}
      {...props}
    />
  );
}

export function MenuSeparator({ className, ...props }: React.ComponentProps<typeof DropdownMenu.Separator>) {
  return (
    <DropdownMenu.Separator
      className={cn("-mx-1 my-1 h-px bg-[var(--border-subtle)]", className)}
      {...props}
    />
  );
}

export function MenuSub({
  label,
  children,
  icon,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger className={cn(ITEM, "data-[state=open]:bg-[var(--bg-hover)]")}>
        {icon}
        {label}
        <ChevronRight className="ml-auto size-3.5" />
      </DropdownMenu.SubTrigger>
      <DropdownMenu.Portal>
        <DropdownMenu.SubContent className={SURFACE} sideOffset={4} alignOffset={-4}>
          {children}
        </DropdownMenu.SubContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Sub>
  );
}
