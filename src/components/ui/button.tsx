import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/cn";

/**
 * Button heights are 24 / 28 / 32 / 36px. The internal app lives on `sm`
 * (28px), which matches Plane's toolbar density; forms and the portal use `md`.
 * Only `primary` and `danger` carry a fill -- everything else is a hairline or
 * nothing at all, so a toolbar reads as one object rather than a row of chips.
 */
const VARIANTS = {
  primary:
    "bg-[var(--accent)] text-[var(--accent-on)] shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] hover:bg-[var(--accent-hover)] active:bg-[var(--accent-hover)]",
  secondary:
    "bg-[var(--bg-panel)] text-[var(--text-primary)] border border-[var(--border-default)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-active)]",
  ghost:
    "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] active:bg-[var(--bg-active)]",
  danger:
    // Dark mode's danger is a bright coral that cannot carry white text
    // (2.79:1), so the foreground is its own token, as with the accent.
    "bg-[var(--danger)] text-[var(--danger-on)] hover:brightness-110 active:brightness-95",
  "danger-ghost":
    "text-[var(--danger)] hover:bg-[var(--danger-subtle)]",
} as const;

const SIZES = {
  xs: "h-6 px-1.5 gap-1 text-2xs rounded-[var(--radius-xs)]",
  sm: "h-7 px-2.5 gap-1.5 text-xs rounded-[var(--radius-sm)]",
  md: "h-8 px-3 gap-1.5 text-base rounded-[var(--radius-md)]",
  lg: "h-9 px-4 gap-2 text-base rounded-[var(--radius-md)]",
} as const;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "secondary", size = "sm", asChild, type, ...props },
  ref,
) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? "button")}
      className={cn(
        "inline-flex select-none items-center justify-center whitespace-nowrap font-medium",
        "transition-colors duration-100 ease-[var(--ease-out-quart)]",
        "disabled:pointer-events-none disabled:opacity-45",
        "[&_svg]:shrink-0 [&_svg]:size-3.5",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
});

/** Square button for a lone icon. Keeps a 28px hit area on desktop, 36 on touch. */
export const IconButton = React.forwardRef<
  HTMLButtonElement,
  ButtonProps & { label: string }
>(function IconButton({ className, label, size = "sm", ...props }, ref) {
  return (
    <Button
      ref={ref}
      size={size}
      aria-label={label}
      title={label}
      className={cn(
        "px-0",
        size === "xs" && "w-6",
        size === "sm" && "w-7",
        size === "md" && "w-8",
        size === "lg" && "w-9",
        className,
      )}
      {...props}
    />
  );
});
