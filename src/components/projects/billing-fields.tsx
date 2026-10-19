"use client";

import { SectionTitle } from "@/components/ui/card";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/field";
import { Segmented, Switch } from "@/components/ui/toggles";
import { MaintenanceFields } from "@/components/projects/maintenance-fields";
import { billingModelLabel } from "@/lib/billing-model";
import { BILLING_MODELS, type BillingModel, type Currency } from "@/lib/db/types";
import {
  BLANK_MAINTENANCE,
  NO_MAINTENANCE,
  maintenanceBody,
  type MaintenanceFormValues,
} from "@/lib/projects/maintenance-form";

/** The billing inputs as the forms hold them: strings, as typed. Flat, for the settings dirty check. */
export interface BillingValues extends MaintenanceFormValues {
  billing_model: BillingModel;
  currency: Currency;
  hourly_rate: string;
  retainer_amount: string;
  tax_percent: string;
  payment_instructions: string;
  retainer_show_hours: boolean;
}

export const BLANK_BILLING: BillingValues = {
  billing_model: "hourly",
  currency: "USD",
  hourly_rate: "",
  retainer_amount: "",
  tax_percent: "0",
  payment_instructions: "",
  retainer_show_hours: false,
  ...BLANK_MAINTENANCE,
};

/** The billing half of a create or update body. A field another model owns goes as null. */
export function billingBody(values: BillingValues) {
  const tax = Number(values.tax_percent);
  return {
    billing_model: values.billing_model,
    currency: values.currency,
    hourly_rate:
      values.billing_model === "hourly" && values.hourly_rate !== "" ? Number(values.hourly_rate) : null,
    retainer_amount:
      values.billing_model === "retainer" && values.retainer_amount !== ""
        ? Number(values.retainer_amount)
        : null,
    tax_rate: Number.isFinite(tax) ? Math.max(0, Math.min(100, tax)) / 100 : 0,
    payment_instructions: values.payment_instructions,
    retainer_show_hours: values.billing_model === "retainer" ? values.retainer_show_hours : false,
    ...(values.billing_model === "maintenance" ? maintenanceBody(values) : NO_MAINTENANCE),
  };
}

/**
 * The Billing section of the new-project and settings forms. `editing` gives
 * the settings form its `s_` ids and the copy that speaks to invoices already
 * issued; creation adds placeholders and makes the rate inputs `required`.
 */
export function BillingFields({
  values,
  errors,
  onChange,
  editing = false,
}: {
  values: BillingValues;
  errors: Record<string, string>;
  onChange: (patch: Partial<BillingValues>) => void;
  editing?: boolean;
}) {
  const prefix = editing ? "s_" : "";
  const { billing_model: model, currency } = values;

  return (
    <section className="space-y-4">
      <SectionTitle>Billing</SectionTitle>

      <div className="grid gap-4 grid-cols-[minmax(0,1fr)] sm:grid-cols-2">
        <Field label="Billing model" error={errors.billing_model} className="sm:col-span-2">
          <Segmented
            size="md"
            label="Billing model"
            value={model}
            onChange={(value) => onChange({ billing_model: value })}
            options={BILLING_MODELS.map((option) => ({
              value: option,
              label: billingModelLabel(option),
            }))}
            className="w-full [&>button]:flex-1"
          />
        </Field>

        <Field label="Currency" htmlFor={`${prefix}currency`} error={errors.currency}>
          <NativeSelect
            id={`${prefix}currency`}
            value={currency}
            onChange={(event) => onChange({ currency: event.target.value as Currency })}
          >
            <option value="USD">USD — US dollars</option>
            <option value="CAD">CAD — Canadian dollars</option>
          </NativeSelect>
        </Field>

        {model === "hourly" && (
          <Field
            label="Hourly rate"
            htmlFor={`${prefix}hourly_rate`}
            required
            error={errors.hourly_rate}
            hint={
              editing
                ? "Applies to time not yet on a finalized invoice."
                : `Charged per billed hour, in ${currency}.`
            }
          >
            <Input
              id={`${prefix}hourly_rate`}
              value={values.hourly_rate}
              inputMode="decimal"
              type="number"
              min="0"
              step="1"
              required={!editing}
              placeholder={editing ? undefined : "150"}
              aria-invalid={errors.hourly_rate ? true : undefined}
              onChange={(event) => onChange({ hourly_rate: event.target.value })}
            />
          </Field>
        )}
        {model === "retainer" && (
          <Field
            label="Monthly retainer"
            htmlFor={`${prefix}retainer_amount`}
            required
            error={errors.retainer_amount}
            hint={editing ? undefined : `Invoiced every month, in ${currency}.`}
          >
            <Input
              id={`${prefix}retainer_amount`}
              value={values.retainer_amount}
              inputMode="decimal"
              type="number"
              min="0"
              step="1"
              required={!editing}
              placeholder={editing ? undefined : "4000"}
              aria-invalid={errors.retainer_amount ? true : undefined}
              onChange={(event) => onChange({ retainer_amount: event.target.value })}
            />
          </Field>
        )}

        <Field
          label="Tax rate"
          htmlFor={editing ? "s_tax" : "tax_rate"}
          error={errors.tax_rate}
          hint={editing ? "Percent, on new invoices only." : "Percent added on invoices. 0 for none."}
        >
          <div className="relative">
            <Input
              id={editing ? "s_tax" : "tax_rate"}
              value={values.tax_percent}
              inputMode="decimal"
              type="number"
              min="0"
              max="100"
              step="0.5"
              className="pr-7"
              onChange={(event) => onChange({ tax_percent: event.target.value })}
            />
            <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-[var(--text-tertiary)]">
              %
            </span>
          </div>
        </Field>
      </div>

      {model === "maintenance" && (
        <MaintenanceFields
          idPrefix={prefix}
          currency={currency}
          values={values}
          errors={errors}
          onChange={onChange}
        />
      )}

      {model === "retainer" && (
        <label className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-2.5">
          <Switch
            checked={values.retainer_show_hours}
            onCheckedChange={(checked) => onChange({ retainer_show_hours: checked })}
            className="mt-0.5"
          />
          <span className="min-w-0">
            <span className="block text-xs font-medium text-[var(--text-secondary)]">
              Show hours in the portal
            </span>
            <span className="block text-xs text-[var(--text-tertiary)]">
              Off by default — a retainer client normally sees outcomes, not a timesheet.
            </span>
          </span>
        </label>
      )}

      <Field
        label="Payment instructions"
        htmlFor={editing ? "s_payment" : "payment_instructions"}
        error={errors.payment_instructions}
        hint={
          editing
            ? "Printed on every invoice generated from now on."
            : "Printed at the bottom of every invoice for this project."
        }
      >
        <Textarea
          id={editing ? "s_payment" : "payment_instructions"}
          value={values.payment_instructions}
          rows={2}
          maxLength={2000}
          placeholder={editing ? undefined : "e-Transfer to billing@example.com, or USDC on Base to 0x…"}
          onChange={(event) => onChange({ payment_instructions: event.target.value })}
        />
      </Field>
    </section>
  );
}
