import { describe, expect, it } from "vitest";
import {
  BLANK_MAINTENANCE,
  NO_MAINTENANCE,
  maintenanceBody,
  maintenanceValuesFrom,
} from "@/lib/projects/maintenance-form";

describe("maintenance form values", () => {
  it("sends blanks as nulls and the monthly term by default", () => {
    expect(maintenanceBody(BLANK_MAINTENANCE)).toEqual(NO_MAINTENANCE);
    expect(NO_MAINTENANCE.maintenance_term_months).toBe(1);
  });

  it("parses figures and snaps the start date to the 1st", () => {
    expect(
      maintenanceBody({
        build_fee: "6000",
        maintenance_monthly: "150",
        maintenance_price_6: "",
        maintenance_price_12: "1620",
        maintenance_term_months: "12",
        maintenance_starts_on: "2026-10-17",
      }),
    ).toEqual({
      build_fee: 6000,
      maintenance_monthly: 150,
      maintenance_price_6: null,
      maintenance_price_12: 1620,
      maintenance_term_months: 12,
      maintenance_starts_on: "2026-10-01",
    });
  });

  it("round-trips a saved project", () => {
    const saved = {
      build_fee: null,
      maintenance_monthly: 150,
      maintenance_price_6: 840,
      maintenance_price_12: null,
      maintenance_term_months: 6 as const,
      maintenance_starts_on: "2026-10-01",
    };
    expect(maintenanceBody(maintenanceValuesFrom(saved))).toEqual(saved);
  });
});
