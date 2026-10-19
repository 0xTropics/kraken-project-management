"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Loader2, Plus } from "lucide-react";
import { billingModelLabel } from "@/lib/billing-model";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/field";
import { api, ApiRequestError, fieldErrors } from "@/lib/client-api";
import { addDays, formatHours, today } from "@/lib/format";
import type { TimeEntryRow, TimeFormWorkItem, TimeProject } from "@/lib/data/time";

/**
 * The one screen the operator uses from a phone.
 *
 * Every control is at least 44px tall below `md`, the hours field is numeric
 * with `inputMode="decimal"` so the phone keypad opens on the digits, and the
 * two fields that are almost never touched -- billed hours and the discount
 * reason -- stay behind a disclosure so the default form is six taps end to end.
 *
 * After a save the form stays put, clears, and returns focus to hours: the real
 * workflow is logging Monday through Friday in one sitting, not one entry and a
 * navigation.
 */

// Five chips, because five 44px targets plus the input is exactly what fits
// across a 390px screen without a scroller or a clipped sixth.
const HOUR_CHIPS = [0.5, 1, 2, 4, 8];

/** 44px on touch, back to the 36px desk density from `md` up. */
const TOUCH = "h-11 md:h-9";

interface FormState {
  date: string;
  project_id: string;
  hours_worked: string;
  description: string;
  work_item_id: string;
  hours_billed: string;
  discount_reason: string;
  rate_override: string;
}

function blank(date: string, projectId: string): FormState {
  return {
    date,
    project_id: projectId,
    hours_worked: "",
    description: "",
    work_item_id: "",
    hours_billed: "",
    discount_reason: "",
    rate_override: "",
  };
}

export function TimeEntryForm({
  projects,
  workItems,
  defaultProjectId,
  lockProject = false,
  onSaved,
  footerSlot,
}: {
  projects: TimeProject[];
  workItems: TimeFormWorkItem[];
  defaultProjectId?: string | null;
  /** The project tab's modal fixes the project; the global form lets you pick. */
  lockProject?: boolean;
  onSaved?: (entry: TimeEntryRow) => void;
  /** Rendered beside the submit button (the modal puts Cancel here). */
  footerSlot?: React.ReactNode;
}) {
  const router = useRouter();
  // Pinned once per mount: "Today" must not drift if the tab is left open
  // across midnight while a date is already chosen.
  const now = React.useMemo(() => today(), []);
  const initialProject = defaultProjectId ?? projects[0]?.id ?? "";

  const [state, setState] = React.useState<FormState>(() => blank(now, initialProject));
  const [adjust, setAdjust] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const hoursRef = React.useRef<HTMLInputElement>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setState((current) => ({ ...current, [key]: value }));
    setErrors((current) => (current[key] ? { ...current, [key]: "" } : current));
  };

  const project = projects.find((p) => p.id === state.project_id) ?? null;
  const projectItems = workItems.filter((item) => item.project_id === state.project_id);

  // Clients group the picker; a bare list of fifteen project names is a wall.
  const grouped = React.useMemo(() => {
    const map = new Map<string, TimeProject[]>();
    for (const p of projects) map.set(p.client_name, [...(map.get(p.client_name) ?? []), p]);
    return [...map.entries()];
  }, [projects]);

  const worked = Number.parseFloat(state.hours_worked);
  const billed = state.hours_billed === "" ? worked : Number.parseFloat(state.hours_billed);
  const gap =
    Number.isFinite(worked) && Number.isFinite(billed) && worked > billed
      ? Math.round((worked - billed) * 100) / 100
      : 0;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setErrors({});

    if (!state.project_id) {
      setErrors({ project_id: "Pick a project" });
      return;
    }
    if (!Number.isFinite(worked) || worked <= 0) {
      setErrors({ hours_worked: "Log more than zero hours" });
      hoursRef.current?.focus();
      return;
    }

    setPending(true);
    try {
      const entry = await api<TimeEntryRow>("/api/internal/time-entries", {
        method: "POST",
        body: {
          project_id: state.project_id,
          date: state.date,
          hours_worked: worked,
          hours_billed: state.hours_billed === "" ? undefined : billed,
          description: state.description.trim() || null,
          work_item_id: state.work_item_id || null,
          rate_override: state.rate_override === "" ? null : Number(state.rate_override),
          discount_reason: state.discount_reason.trim() || null,
        },
      });

      toast.success(`Logged ${formatHours(entry.hours_worked)} to ${entry.project_name}`, {
        description: gap > 0 ? `${formatHours(gap)} written off as goodwill.` : undefined,
      });

      // Keep the project and the date: the next entry is nearly always the same
      // day on the same project.
      setState((current) => ({ ...blank(current.date, current.project_id) }));
      setAdjust(false);
      onSaved?.(entry);
      router.refresh();
      hoursRef.current?.focus();
    } catch (error) {
      if (error instanceof ApiRequestError && error.body.issues?.length) {
        setErrors(fieldErrors(error));
        toast.error("Some fields need attention");
      } else {
        toast.error(error instanceof Error ? error.message : "Could not log that entry");
      }
    } finally {
      setPending(false);
    }
  }

  if (projects.length === 0) {
    return (
      <p className="text-sm text-[var(--text-tertiary)]">
        Create a project before logging time against it.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {/* Date ------------------------------------------------------------- */}
      <Field label="Date" htmlFor="entry-date" required error={errors.date}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1.5">
            {[
              { label: "Today", value: now },
              { label: "Yesterday", value: addDays(now, -1) },
            ].map((chip) => (
              <button
                key={chip.label}
                type="button"
                aria-pressed={state.date === chip.value}
                onClick={() => set("date", chip.value)}
                className={cn(
                  "inline-flex min-w-11 items-center justify-center rounded-[var(--radius-md)] px-3 text-xs font-medium",
                  "border transition-colors duration-100",
                  TOUCH,
                  state.date === chip.value
                    ? "border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent-text)]"
                    : "border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]",
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>
          <Input
            id="entry-date"
            name="date"
            type="date"
            required
            value={state.date}
            onChange={(event) => set("date", event.target.value)}
            className={cn(TOUCH, "min-w-0 flex-1 basis-40")}
          />
        </div>
      </Field>

      {/* Project ---------------------------------------------------------- */}
      <Field
        label="Project"
        htmlFor="entry-project"
        required
        error={errors.project_id}
        hint={
          project
            ? project.billing_model === "hourly"
              ? `Hourly · ${project.hourly_rate ?? 0} ${project.currency}/h`
              : `${billingModelLabel(project.billing_model)} · ${project.currency}`
            : undefined
        }
      >
        <NativeSelect
          id="entry-project"
          name="project_id"
          value={state.project_id}
          disabled={lockProject}
          aria-invalid={errors.project_id ? true : undefined}
          onChange={(event) => {
            set("project_id", event.target.value);
            set("work_item_id", "");
          }}
          className={TOUCH}
        >
          {grouped.map(([client, list]) => (
            <optgroup key={client} label={client}>
              {list.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          ))}
        </NativeSelect>
      </Field>

      {/* Hours ------------------------------------------------------------ */}
      <Field label="Hours worked" htmlFor="entry-hours" required error={errors.hours_worked}>
        {/* The chips drop to their own row below `sm`, because the modal on the
            project tab is narrower than this page and a clipped chip is worse
            than a second row. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            id="entry-hours"
            ref={hoursRef}
            name="hours_worked"
            // `decimal` opens the numeric keypad with a separator; `type=number`
            // alone gives a keypad on iOS but a spinner nobody can hit on touch.
            inputMode="decimal"
            type="text"
            autoComplete="off"
            required
            placeholder="0.00"
            aria-invalid={errors.hours_worked ? true : undefined}
            value={state.hours_worked}
            onChange={(event) => set("hours_worked", event.target.value.replace(/[^\d.]/g, ""))}
            className={cn(TOUCH, "w-24 shrink-0 text-lg font-medium tabular-nums md:text-base")}
          />
          <div className="flex min-w-0 flex-1 gap-1.5">
            {HOUR_CHIPS.map((value) => {
              const active = Number.parseFloat(state.hours_worked) === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => set("hours_worked", String(value))}
                  className={cn(
                    "inline-flex min-w-11 max-w-16 flex-1 items-center justify-center rounded-[var(--radius-md)]",
                    "border text-xs font-medium tabular-nums transition-colors duration-100",
                    TOUCH,
                    active
                      ? "border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent-text)]"
                      : "border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]",
                  )}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </div>
      </Field>

      {/* Description ------------------------------------------------------ */}
      <Field
        label="What you did"
        htmlFor="entry-description"
        error={errors.description}
        hint="Appears on the invoice line."
      >
        <Textarea
          id="entry-description"
          name="description"
          rows={3}
          placeholder="Bench allocation grid — capacity maths"
          value={state.description}
          onChange={(event) => set("description", event.target.value)}
          className="min-h-24"
        />
      </Field>

      {/* Work item -------------------------------------------------------- */}
      <Field
        label="Work item"
        htmlFor="entry-work-item"
        error={errors.work_item_id}
        hint={projectItems.length === 0 ? "This project has no open work items." : "Optional."}
      >
        <NativeSelect
          id="entry-work-item"
          name="work_item_id"
          value={state.work_item_id}
          disabled={projectItems.length === 0}
          onChange={(event) => set("work_item_id", event.target.value)}
          className={TOUCH}
        >
          <option value="">No work item</option>
          {projectItems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </NativeSelect>
      </Field>

      {/* Adjustments ------------------------------------------------------ */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
        <button
          type="button"
          aria-expanded={adjust}
          aria-controls="entry-adjust"
          onClick={() => setAdjust((v) => !v)}
          className={cn(
            "flex w-full items-center gap-2 rounded-[var(--radius-lg)] px-3 text-left",
            "text-xs font-medium text-[var(--text-secondary)] transition-colors duration-100",
            "hover:bg-[var(--bg-hover)]",
            TOUCH,
          )}
        >
          <ChevronDown
            className={cn(
              "size-3.5 text-[var(--text-tertiary)] transition-transform duration-150",
              !adjust && "-rotate-90",
            )}
          />
          Adjust billed hours / discount
          {gap > 0 && (
            <span className="ml-auto text-2xs tabular-nums text-[var(--warning)]">
              −{formatHours(gap)}
            </span>
          )}
        </button>

        {adjust && (
          <div id="entry-adjust" className="space-y-4 border-t border-[var(--border-subtle)] p-3">
            <Field
              label="Hours billed"
              htmlFor="entry-billed"
              error={errors.hours_billed}
              hint={
                gap > 0
                  ? `Writing off ${formatHours(gap)} as goodwill.`
                  : "Defaults to the hours worked."
              }
            >
              <Input
                id="entry-billed"
                name="hours_billed"
                inputMode="decimal"
                type="text"
                autoComplete="off"
                placeholder={Number.isFinite(worked) ? worked.toFixed(2) : "0.00"}
                aria-invalid={errors.hours_billed ? true : undefined}
                value={state.hours_billed}
                onChange={(event) => set("hours_billed", event.target.value.replace(/[^\d.]/g, ""))}
                className={cn(TOUCH, "w-28 tabular-nums")}
              />
            </Field>

            <Field
              label="Discount reason"
              htmlFor="entry-discount"
              error={errors.discount_reason}
              hint="Shown on the invoice when billed hours are lower."
            >
              <Input
                id="entry-discount"
                name="discount_reason"
                placeholder="Scope creep on our side"
                value={state.discount_reason}
                onChange={(event) => set("discount_reason", event.target.value)}
                className={TOUCH}
              />
            </Field>

            {project?.billing_model === "hourly" && (
              <Field
                label="Rate override"
                htmlFor="entry-rate"
                error={errors.rate_override}
                hint={`Leave empty to bill at ${project.hourly_rate ?? 0} ${project.currency}/h.`}
              >
                <Input
                  id="entry-rate"
                  name="rate_override"
                  inputMode="decimal"
                  type="text"
                  autoComplete="off"
                  placeholder={String(project.hourly_rate ?? 0)}
                  value={state.rate_override}
                  onChange={(event) =>
                    set("rate_override", event.target.value.replace(/[^\d.]/g, ""))
                  }
                  className={cn(TOUCH, "w-32 tabular-nums")}
                />
              </Field>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={pending}
          className={cn(TOUCH, "flex-1 md:flex-none md:px-4")}
        >
          {pending ? <Loader2 className="animate-spin" /> : <Plus />}
          Log time
        </Button>
        {footerSlot}
      </div>
    </form>
  );
}
