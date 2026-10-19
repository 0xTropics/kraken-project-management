"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button, IconButton } from "./button";

export const Modal = Dialog.Root;
export const ModalTrigger = Dialog.Trigger;
export const ModalClose = Dialog.Close;

/**
 * Modals are for things that genuinely interrupt: creating a record, or
 * confirming something irreversible. Anything editable in place should be
 * edited in place instead.
 */
export function ModalContent({
  title,
  description,
  footer,
  size = "md",
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
  children: React.ReactNode;
}) {
  const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" } as const;
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px] data-[state=open]:animate-[kraken-fade-in_120ms_ease-out]" />
      <Dialog.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2",
          "max-h-[calc(100dvh-3rem)] overflow-hidden rounded-[var(--radius-xl)]",
          "border border-[var(--border-default)] bg-[var(--bg-raised)] shadow-[var(--shadow-modal)]",
          "data-[state=open]:animate-[kraken-pop-in_150ms_var(--ease-out-quart)]",
          "flex flex-col",
          widths[size],
          className,
        )}
      >
        <div className="flex items-start gap-3 px-5 pb-3 pt-4">
          <div className="min-w-0 flex-1">
            <Dialog.Title className="text-lg font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
              {title}
            </Dialog.Title>
            {description ? (
              <Dialog.Description className="mt-1 text-sm text-[var(--text-secondary)]">
                {description}
              </Dialog.Description>
            ) : (
              <Dialog.Description className="sr-only">{title}</Dialog.Description>
            )}
          </div>
          <Dialog.Close asChild>
            <IconButton label="Close" variant="ghost" size="sm" className="-mr-1 -mt-0.5">
              <X />
            </IconButton>
          </Dialog.Close>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-1">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] px-5 py-3">
            {footer}
          </div>
        )}
      </Dialog.Content>
    </Dialog.Portal>
  );
}

/**
 * Confirms something irreversible. Cancel only closes, so it goes through
 * `onOpenChange(false)` exactly as Escape does; the danger button spins and
 * locks while `busy`, and shows `icon` when idle.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  icon,
  busy,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel: React.ReactNode;
  cancelLabel?: string;
  icon?: React.ReactNode;
  busy: boolean;
  onConfirm: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        title={title}
        description={description}
        size="sm"
        footer={
          <>
            <ModalClose asChild>
              <Button variant="ghost" size="md">
                {cancelLabel}
              </Button>
            </ModalClose>
            <Button variant="danger" size="md" disabled={busy} onClick={onConfirm}>
              {busy ? <Loader2 className="animate-spin" /> : icon}
              {confirmLabel}
            </Button>
          </>
        }
      >
        {children}
      </ModalContent>
    </Modal>
  );
}

/**
 * A right-hand sheet rather than a centred modal: the page stays visible
 * behind it. Goes inside `<Modal>`; title, close button and body are the
 * caller's.
 */
export function SheetContent({ children }: { children: React.ReactNode }) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-black/25 data-[state=open]:animate-[kraken-fade-in_120ms_ease-out] md:bg-black/15" />
      <Dialog.Content
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-[var(--border-default)]",
          "bg-[var(--bg-app)] shadow-[var(--shadow-modal)] sm:w-[30rem]",
          "data-[state=open]:animate-[kraken-slide-up_180ms_var(--ease-out-quart)]",
        )}
      >
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  );
}
