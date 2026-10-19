import * as React from "react";
import { cn } from "@/lib/cn";

const CONTROL_BASE =
  "w-full bg-[var(--bg-panel)] text-[var(--text-primary)] " +
  "border border-[var(--border-default)] rounded-[var(--radius-md)] " +
  "transition-[border-color,box-shadow] duration-100 " +
  "hover:border-[var(--border-strong)] " +
  "focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)] " +
  "disabled:opacity-55 disabled:cursor-not-allowed disabled:bg-[var(--bg-inset)] " +
  "aria-[invalid=true]:border-[var(--danger)] aria-[invalid=true]:ring-[var(--danger-subtle)]";

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(CONTROL_BASE, "h-9 px-2.5 text-base", className)}
        {...props}
      />
    );
  },
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(CONTROL_BASE, "px-2.5 py-2 text-base leading-relaxed resize-y min-h-20", className)}
        {...props}
      />
    );
  },
);

export const NativeSelect = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(
  function NativeSelect({ className, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          CONTROL_BASE,
          "h-9 pl-2.5 pr-8 text-base appearance-none cursor-pointer",
          "bg-[image:var(--select-caret)] bg-[position:right_0.6rem_center] bg-no-repeat",
          className,
        )}
        style={{
          // Inline so the caret inherits the current text colour in both themes.
          ["--select-caret" as string]:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239b9a93' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        }}
        {...props}
      />
    );
  },
);

export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)]"
      >
        {label}
        {required && (
          <span className="text-[var(--danger)]" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-[var(--text-tertiary)]">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Notion-style inline edit: reads as text until you focus it, at which point it
 * grows the chrome of a real input. Used for work-item titles and note bodies
 * so an edit never costs a modal.
 */
export const InlineInput = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  function InlineInput({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full bg-transparent rounded-[var(--radius-sm)] px-1.5 py-0.5 -mx-1.5",
          "border border-transparent transition-colors duration-100",
          "hover:bg-[var(--bg-hover)]",
          "focus:outline-none focus:bg-[var(--bg-panel)] focus:border-[var(--accent)]",
          "focus:ring-2 focus:ring-[var(--accent-ring)]",
          className,
        )}
        {...props}
      />
    );
  },
);
