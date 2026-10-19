import { z } from "zod";
import {
  BILLING_MODELS,
  CHARGE_KINDS,
  CURRENCIES,
  INVOICE_LINE_KINDS,
  MAINTENANCE_TERMS,
  MILESTONE_STATUSES,
  PAYMENT_METHODS,
  PROJECT_STATUSES,
  WORK_ITEM_PRIORITIES,
  WORK_ITEM_STATUSES,
  WORK_ITEM_TYPES,
  type MaintenanceTerm,
} from "@/lib/db/types";
import { billingIssues } from "@/lib/projects/billing-rules";

export const uuid = z.string().uuid("Expected a valid id");
/** For ids that arrive in a path segment: a non-uuid must 404, not reach Postgres as a cast error. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a date as YYYY-MM-DD");
export const nonEmpty = (label: string, max = 500) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long`);
export const optionalText = (max = 20_000) =>
  z
    .string()
    .max(max)
    .transform((v) => (v.trim() === "" ? null : v))
    .nullable()
    .optional();

export const money = z.coerce.number().min(0, "Must be zero or more").max(9_999_999);
const positiveMoney = z.coerce
  .number()
  .positive("Enter an amount greater than zero")
  .max(9_999_999);
const maintenanceTerm = z
  .number()
  .refine((v) => (MAINTENANCE_TERMS as readonly number[]).includes(v), {
    message: "Choose monthly, 6 months or 12 months",
  })
  .transform((v) => v as MaintenanceTerm);
const firstOfMonth = dateString.refine((v) => v.endsWith("-01"), {
  message: "Maintenance starts on the 1st of a month",
});

export const contactInput = z.object({
  name: nonEmpty("Contact name", 160),
  email: z
    .union([z.string().email("Expected an email address"), z.literal("")])
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  is_primary: z.boolean().default(false),
});

export const contactList = z
  .array(contactInput)
  .max(50, "Too many contacts")
  .refine((list) => list.filter((c) => c.is_primary).length <= 1, {
    message: "Only one contact can be the primary",
  });

export const clientInput = z.object({
  name: nonEmpty("Client name", 160),
  notes: optionalText(),
  contacts: contactList.default([]),
});

// `contacts` without its create-time default: zod 4's `.partial()` still
// applies it, so an archive toggle ({ archived }) used to replace the client's
// contacts with [].
export const clientUpdateInput = clientInput.partial().extend({
  contacts: contactList.optional(),
  archived: z.boolean().optional(),
});

const projectFields = z.object({
  client_id: uuid,
  name: nonEmpty("Project name", 160),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens")
    .min(2)
    .max(60),
  description: optionalText(4000),
  billing_model: z.enum(BILLING_MODELS),
  currency: z.enum(CURRENCIES),
  hourly_rate: money.nullable().optional(),
  retainer_amount: money.nullable().optional(),
  tax_rate: z.coerce.number().min(0).max(1).default(0),
  // Required at creation. There is no path that creates a project
  // without a portal password.
  portal_password: z
    .string()
    .min(10, "Use at least 10 characters")
    .max(200),
  payment_instructions: optionalText(2000),
  retainer_show_hours: z.boolean().default(false),
  repo_url: optionalText(500),
  started_at: dateString.nullable().optional(),
  build_fee: positiveMoney.nullable().optional(),
  maintenance_monthly: positiveMoney.nullable().optional(),
  maintenance_price_6: positiveMoney.nullable().optional(),
  maintenance_price_12: positiveMoney.nullable().optional(),
  maintenance_term_months: maintenanceTerm.optional(),
  maintenance_starts_on: firstOfMonth.nullable().optional(),
});

export const projectCreateInput = projectFields.superRefine((v, ctx) => {
  for (const issue of billingIssues(v)) {
    ctx.addIssue({ code: "custom", path: [issue.path], message: issue.message });
  }
});

// The defaulted fields are re-declared without their defaults: zod 4's
// `.partial()` still applies a `.default()`, which would reset the column on
// every PATCH that omits it.
export const projectUpdateInput = projectFields
  .omit({ client_id: true, slug: true, portal_password: true })
  .extend({
    status: z.enum(PROJECT_STATUSES),
    tax_rate: z.coerce.number().min(0).max(1),
    retainer_show_hours: z.boolean(),
  })
  .partial();

export const milestoneInput = z.object({
  name: nonEmpty("Milestone name", 160),
  target_date: dateString.nullable().optional(),
  status: z.enum(MILESTONE_STATUSES).optional(),
  client_visible: z.boolean().optional(),
});

export const workItemCreateInput = z.object({
  title: nonEmpty("Title", 300),
  type: z.enum(WORK_ITEM_TYPES),
  status: z.enum(WORK_ITEM_STATUSES).optional(),
  priority: z.enum(WORK_ITEM_PRIORITIES).optional(),
  description: optionalText(),
  milestone_id: uuid.nullable().optional(),
  client_visible: z.boolean().optional(),
});

export const workItemUpdateInput = workItemCreateInput
  .partial()
  .extend({ sort_order: z.number().int().optional() });

export const progressNoteInput = z.object({
  body: nonEmpty("Note body", 20_000),
  work_item_id: uuid.nullable().optional(),
  approved: z.boolean().optional(),
});

export const projectNoteInput = z.object({
  title: nonEmpty("Title", 200),
  body: z.string().max(200_000).default(""),
});

export const invoiceCreateInput = z.object({
  project_id: uuid,
  period_start: dateString,
  period_end: dateString,
  notes: optionalText(4000),
});

export const invoiceLineInput = z.object({
  kind: z.enum(INVOICE_LINE_KINDS),
  description: nonEmpty("Description", 500),
  quantity: z.coerce.number().min(-9999).max(9999),
  unit_amount: z.coerce.number().min(-9_999_999).max(9_999_999),
});

export const markPaidInput = z.object({
  payment_method: z.enum(PAYMENT_METHODS),
  payment_note: optionalText(500),
});


export const declineRequestInput = z.object({
  note: z.string().trim().max(1000, "Note is too long").optional(),
});

export const clientRequestInput = z.object({
  title: nonEmpty("Title", 200),
  body: nonEmpty("Description", 5000),
  requester_name: nonEmpty("Your name", 100),
});

export const portalLoginInput = z.object({
  password: z.string().min(1, "Enter the password").max(200),
});

export const rotatePortalPasswordInput = z.object({
  portal_password: z.string().min(10, "Use at least 10 characters").max(200),
});

export const depositInput = z.object({
  amount: z.coerce.number().positive("Enter an amount greater than zero").max(9_999_999),
  received_on: dateString,
  method: z.enum(PAYMENT_METHODS),
  note: optionalText(500),
});

export const chargeInput = z.object({
  kind: z.enum(CHARGE_KINDS),
  description: nonEmpty("Description", 500),
  amount: z.coerce.number().positive("Enter an amount greater than zero").max(9_999_999),
  // OVERRIDE (task-5 brief defect): z.coerce.boolean() is Boolean(value), so
  // the string "false" coerces to true -- every charge would silently become
  // taxable. A real boolean is required; a malformed client fails validation
  // instead of silently corrupting the tax base.
  taxable: z.boolean(),
  incurred_on: dateString,
  note: optionalText(500),
});

export const buildInstallmentInput = z.object({
  amount: z.coerce.number().positive("Enter an amount greater than zero").max(9_999_999),
  description: nonEmpty("Description", 200),
});

export const invoiceDepositInput = z.object({
  deposit_applied: z.coerce.number().min(0, "Cannot be negative").max(9_999_999),
});
