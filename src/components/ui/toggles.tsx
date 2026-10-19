"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

type ToggleProps = Omit<React.ComponentProps<"input">, "type" | "onChange"> & {
  onCheckedChange?: (checked: boolean) => void;
};

// Both toggles are native checkboxes, so labels, `id`, `name` and Space come
// free. Enter is the one difference from the buttons they replaced: on a
// checkbox it would submit the surrounding form, so it is stopped, and on the
// switch it still toggles.
function onEnter(toggles: boolean) {
  return (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (toggles) event.currentTarget.click();
  };
}

export function Switch({ className, onCheckedChange, ...props }: ToggleProps) {
  return (
    <input
      type="checkbox"
      role="switch"
      onChange={(event) => onCheckedChange?.(event.target.checked)}
      onKeyDown={onEnter(true)}
      className={cn(
        "relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer appearance-none rounded-full",
        "border border-transparent transition-colors duration-150",
        "bg-[var(--border-strong)] checked:bg-[var(--accent)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        // The thumb.
        "before:absolute before:left-0 before:top-px before:size-3.5 before:translate-x-0.5 before:rounded-full before:bg-white before:shadow-sm",
        "before:transition-transform before:duration-150 checked:before:translate-x-[1.0625rem]",
        className,
      )}
      {...props}
    />
  );
}

/** `className` lands on the input itself, so focus and hover variants work. */
export function Checkbox({ className, onCheckedChange, ...props }: ToggleProps) {
  return (
    <span className="grid shrink-0 place-items-center">
      <input
        type="checkbox"
        onChange={(event) => onCheckedChange?.(event.target.checked)}
        onKeyDown={onEnter(false)}
        className={cn(
          "peer col-start-1 row-start-1 size-4 appearance-none rounded-[var(--radius-xs)]",
          "border border-[var(--border-strong)] transition-colors duration-100",
          "hover:border-[var(--accent)]",
          "checked:border-[var(--accent)] checked:bg-[var(--accent)]",
          "disabled:cursor-not-allowed disabled:opacity-45",
          className,
        )}
        {...props}
      />
      <Check
        className="pointer-events-none invisible col-start-1 row-start-1 size-3 text-[var(--accent-on)] peer-checked:visible peer-disabled:opacity-45"
        strokeWidth={3}
      />
    </span>
  );
}

/**
 * Two-to-four choices that are always visible: view switchers, period pickers.
 * `size="icon"` is for icon-only options; give each an sr-only `label` and a
 * `title` for the tooltip.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "sm",
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: React.ReactNode; icon?: React.ReactNode; title?: string }[];
  className?: string;
  size?: "sm" | "md" | "icon";
  label?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-[var(--radius-md)] bg-[var(--bg-inset)] p-0.5",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] font-medium",
              "transition-colors duration-100",
              size === "sm" && "h-6 px-2 text-xs",
              size === "md" && "h-7 px-2.5 text-sm",
              size === "icon" && "size-6 justify-center",
              "[&_svg]:size-3.5",
              active
                ? "bg-[var(--bg-panel)] text-[var(--text-primary)] shadow-[var(--shadow-card)]"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
