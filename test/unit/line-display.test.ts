import { describe, expect, it } from "vitest";
import { LINE_KIND_TAG, lineQuantityLabel } from "@/lib/invoices/line-display";

describe("lineQuantityLabel", () => {
  it("reads hours for time and goodwill lines", () => {
    expect(lineQuantityLabel({ kind: "time", quantity: 6.5, amount: 975 })).toBe("6.5 h");
    expect(lineQuantityLabel({ kind: "discount", quantity: -2, amount: -300 })).toBe("-2 h");
  });

  it("reads months for a maintenance term, and a plain count for its prepay discount", () => {
    expect(lineQuantityLabel({ kind: "maintenance", quantity: 12, amount: 1800 })).toBe("12 mo");
    expect(lineQuantityLabel({ kind: "maintenance", quantity: 1, amount: -180 })).toBe("1");
  });

  it("reads a plain count for everything else", () => {
    expect(lineQuantityLabel({ kind: "build", quantity: 1, amount: 2500 })).toBe("1");
    expect(lineQuantityLabel({ kind: "adhoc", quantity: 1, amount: 38.4 })).toBe("1");
    expect(lineQuantityLabel({ kind: "retainer", quantity: 1, amount: 4000 })).toBe("1");
  });
});

describe("LINE_KIND_TAG", () => {
  it("tags maintenance and build lines for the client", () => {
    expect(LINE_KIND_TAG.maintenance).toBe("Maintenance");
    expect(LINE_KIND_TAG.build).toBe("Build");
    expect(LINE_KIND_TAG.adhoc).toBe("Additional");
  });
});
