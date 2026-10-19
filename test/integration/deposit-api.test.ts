import { describe, expect, it } from "vitest";
import { depositInput, invoiceDepositInput } from "@/lib/api/schemas";

describe("depositInput", () => {
  it("accepts a well formed deposit", () => {
    const parsed = depositInput.parse({
      amount: 2500, received_on: "2026-05-20", method: "etransfer", note: "Deposit",
    });
    expect(parsed.amount).toBe(2500);
  });

  it("rejects a zero or negative amount", () => {
    expect(() => depositInput.parse({ amount: 0, received_on: "2026-05-20", method: "cash" })).toThrow();
    expect(() => depositInput.parse({ amount: -1, received_on: "2026-05-20", method: "cash" })).toThrow();
  });

  it("rejects an unknown payment method", () => {
    expect(() => depositInput.parse({ amount: 10, received_on: "2026-05-20", method: "cheque" })).toThrow();
  });

  it("rejects a malformed date", () => {
    expect(() => depositInput.parse({ amount: 10, received_on: "12/06/2026", method: "cash" })).toThrow();
  });
});

describe("invoiceDepositInput", () => {
  it("accepts zero", () => {
    expect(invoiceDepositInput.parse({ deposit_applied: 0 }).deposit_applied).toBe(0);
  });
  it("rejects a negative amount", () => {
    expect(() => invoiceDepositInput.parse({ deposit_applied: -1 })).toThrow();
  });
});
