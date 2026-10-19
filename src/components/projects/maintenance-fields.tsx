"use client";

import { Field, Input } from "@/components/ui/field";
import { Segmented } from "@/components/ui/toggles";
import type { Currency } from "@/lib/db/types";
import { formatDate, formatMoney, startOfMonth } from "@/lib/format";
import { prepaySaving } from "@/lib/invoices/maintenance";
import type { MaintenanceFormValues } from "@/lib/projects/maintenance-form";

type MoneyKey = "build_fee" | "maintenance_monthly" | "maintenance_price_6" | "maintenance_price_12";

/**
 * The build + maintenance inputs, shared by the new-project and settings
 * forms. The prepay prices are the whole term's price -- what the client
 * agrees to -- and the hint shows the discount that implies.
 */
export function MaintenanceFields({
  idPrefix,
  currency,
  values,
  errors,
  onChange,
}: {
  idPrefix: string;
  currency: Currency;
  values: MaintenanceFormValues;
  errors: Record<string, string>;
  onChange: (patch: Partial<MaintenanceFormValues>) => void;
}) {
  const monthly = Number(values.maintenance_monthly);

  function prepayHint(months: 6 | 12, price: string): string {
    if (price.trim() === "") return `Blank means no discount: ${months} × the monthly price.`;
    const saving = prepaySaving(monthly, Number(price), months);
    if (!saving) return "Enter the monthly price to see the discount.";
    if (saving.saving < 0) return "More than paying monthly — lower it.";
    if (saving.saving === 0) return "No discount.";
    return `= ${saving.percent}% off · saves ${formatMoney(saving.saving, currency)}`;
  }

  const money = (key: MoneyKey, label: string, hint: string, required = false) => (
    <Field
      label={label}
      htmlFor={`${idPrefix}${key}`}
      required={required}
      error={errors[key]}
      hint={hint}
    >
      <Input
        id={`${idPrefix}${key}`}
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        required={required}
        value={values[key]}
        aria-invalid={errors[key] ? true : undefined}
        // A computed key widens to an index signature, which TS will not
        // assign to Partial<MaintenanceFormValues> on its own; `key` is a
        // MoneyKey, so every value here is a plain string field.
        onChange={(event) => onChange({ [key]: event.target.value } as Partial<MaintenanceFormValues>)}
      />
    </Field>
  );

  return (
    <div className="grid gap-4 grid-cols-[minmax(0,1fr)] sm:grid-cols-2">
      {money("build_fee", "Build fee", "The whole build, billed in installments. Blank if there is none.")}
      {money("maintenance_monthly", "Monthly maintenance", `Month-by-month price, in ${currency}.`, true)}
      {money("maintenance_price_6", "6-month prepay price", prepayHint(6, values.maintenance_price_6))}
      {money("maintenance_price_12", "12-month prepay price", prepayHint(12, values.maintenance_price_12))}

      <Field label="Client's term" error={errors.maintenance_term_months}>
        <Segmented
          size="md"
          label="Client's term"
          value={values.maintenance_term_months}
          onChange={(value) => onChange({ maintenance_term_months: value })}
          options={[
            { value: "1", label: "Monthly" },
            { value: "6", label: "6 months" },
            { value: "12", label: "12 months" },
          ]}
          className="w-full [&>button]:flex-1"
        />
      </Field>

      <Field
        label="Maintenance starts"
        htmlFor={`${idPrefix}maintenance_starts_on`}
        error={errors.maintenance_starts_on}
        hint={
          values.maintenance_starts_on
            ? `Billed from ${formatDate(values.maintenance_starts_on)}.`
            : "Blank while the site is being built. Always the 1st of a month."
        }
      >
        <Input
          id={`${idPrefix}maintenance_starts_on`}
          type="date"
          value={values.maintenance_starts_on}
          onChange={(event) =>
            onChange({
              maintenance_starts_on:
                event.target.value === "" ? "" : startOfMonth(event.target.value),
            })
          }
        />
      </Field>
    </div>
  );
}
