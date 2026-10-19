import type { DateString, MaintenanceTerm, Project } from "@/lib/db/types";
import { startOfMonth } from "@/lib/format";

/** The build + maintenance inputs as the forms hold them: strings, as typed. */
export interface MaintenanceFormValues {
  build_fee: string;
  maintenance_monthly: string;
  maintenance_price_6: string;
  maintenance_price_12: string;
  maintenance_term_months: "1" | "6" | "12";
  maintenance_starts_on: string;
}

export const BLANK_MAINTENANCE: MaintenanceFormValues = {
  build_fee: "",
  maintenance_monthly: "",
  maintenance_price_6: "",
  maintenance_price_12: "",
  maintenance_term_months: "1",
  maintenance_starts_on: "",
};

export function maintenanceValuesFrom(
  p: Pick<
    Project,
    | "build_fee"
    | "maintenance_monthly"
    | "maintenance_price_6"
    | "maintenance_price_12"
    | "maintenance_term_months"
    | "maintenance_starts_on"
  >,
): MaintenanceFormValues {
  const text = (value: number | null) => (value === null ? "" : String(value));
  return {
    build_fee: text(p.build_fee),
    maintenance_monthly: text(p.maintenance_monthly),
    maintenance_price_6: text(p.maintenance_price_6),
    maintenance_price_12: text(p.maintenance_price_12),
    maintenance_term_months: String(p.maintenance_term_months) as MaintenanceFormValues["maintenance_term_months"],
    maintenance_starts_on: p.maintenance_starts_on ?? "",
  };
}

export interface MaintenanceBody {
  build_fee: number | null;
  maintenance_monthly: number | null;
  maintenance_price_6: number | null;
  maintenance_price_12: number | null;
  maintenance_term_months: MaintenanceTerm;
  maintenance_starts_on: DateString | null;
}

/** What an hourly or retainer project sends: nothing, the way hourly_rate is null on a retainer. */
export const NO_MAINTENANCE: MaintenanceBody = {
  build_fee: null,
  maintenance_monthly: null,
  maintenance_price_6: null,
  maintenance_price_12: null,
  maintenance_term_months: 1,
  maintenance_starts_on: null,
};

export function maintenanceBody(values: MaintenanceFormValues): MaintenanceBody {
  const money = (value: string) => (value.trim() === "" ? null : Number(value));
  return {
    build_fee: money(values.build_fee),
    maintenance_monthly: money(values.maintenance_monthly),
    maintenance_price_6: money(values.maintenance_price_6),
    maintenance_price_12: money(values.maintenance_price_12),
    maintenance_term_months: Number(values.maintenance_term_months) as MaintenanceTerm,
    // Terms are whole months: whatever day is picked, billing starts on the 1st.
    maintenance_starts_on:
      values.maintenance_starts_on === "" ? null : startOfMonth(values.maintenance_starts_on),
  };
}
