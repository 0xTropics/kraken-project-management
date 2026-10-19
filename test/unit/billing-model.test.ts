import { describe, expect, it } from "vitest";
import {
  billingModelDescription,
  billingModelInitial,
  billingModelLabel,
  billingRateLabel,
  flatFeeName,
  monthlyFlatFee,
} from "@/lib/billing-model";
import { formatMoney } from "@/lib/format";

const base = { currency: "CAD" as const, hourly_rate: null, retainer_amount: null, maintenance_monthly: null };

describe("billing model labels", () => {
  it("names every model", () => {
    expect(billingModelLabel("hourly")).toBe("Hourly");
    expect(billingModelLabel("retainer")).toBe("Retainer");
    expect(billingModelLabel("maintenance")).toBe("Build + maintenance");
    expect(billingModelInitial("maintenance")).toBe("M");
  });

  it("describes every model to the client", () => {
    expect(billingModelDescription("hourly")).toBe("Time and materials");
    expect(billingModelDescription("retainer")).toBe("Monthly retainer");
    expect(billingModelDescription("maintenance")).toBe("Website build and maintenance");
  });
});

describe("billingRateLabel", () => {
  it("shows each model's own figure", () => {
    expect(billingRateLabel({ ...base, billing_model: "hourly", hourly_rate: 150 })).toBe(`${formatMoney(150, "CAD")}/h`);
    expect(billingRateLabel({ ...base, billing_model: "retainer", retainer_amount: 4000 })).toBe(`${formatMoney(4000, "CAD")}/mo`);
    expect(billingRateLabel({ ...base, billing_model: "maintenance", maintenance_monthly: 150 })).toBe(
      `${formatMoney(150, "CAD")}/mo maintenance`,
    );
  });

  it("falls back to the model's name when its figure is missing", () => {
    expect(billingRateLabel({ ...base, billing_model: "maintenance" })).toBe("Maintenance");
    expect(billingRateLabel({ ...base, billing_model: "hourly" })).toBe("Hourly");
  });
});

describe("monthlyFlatFee and flatFeeName", () => {
  it("reads the flat fee of the models that have one", () => {
    expect(monthlyFlatFee({ ...base, billing_model: "hourly", retainer_amount: 99 })).toBeNull();
    expect(monthlyFlatFee({ ...base, billing_model: "retainer", retainer_amount: 4000 })).toBe(4000);
    expect(monthlyFlatFee({ ...base, billing_model: "maintenance", maintenance_monthly: 150 })).toBe(150);
    expect(flatFeeName("hourly")).toBeNull();
    expect(flatFeeName("retainer")).toBe("retainer");
    expect(flatFeeName("maintenance")).toBe("maintenance plan");
  });
});
