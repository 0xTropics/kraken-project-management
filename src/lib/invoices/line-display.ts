import { assertNever } from "@/lib/billing-model";
import type { InvoiceLineKind } from "@/lib/db/types";

/**
 * How a line reads to the client. Shared by the on-screen document, the PDF
 * and the draft editor, which each held their own copy of these rules before
 * -- and a document and its PDF that disagree are a client-visible defect.
 */

export const LINE_KIND_TAG: Partial<Record<InvoiceLineKind, string>> = {
  discount: "Goodwill credit",
  retainer: "Retainer",
  adhoc: "Additional",
  maintenance: "Maintenance",
  build: "Build",
};

export function lineQuantityLabel(line: {
  kind: InvoiceLineKind;
  quantity: number;
  amount: number;
}): string {
  const value = Math.round(line.quantity * 100) / 100;
  const text = value % 1 === 0 ? value.toFixed(0) : String(value);
  switch (line.kind) {
    case "time":
    case "discount":
      return `${text} h`;
    case "maintenance":
      // Months for the term line. The prepay discount beneath it is a single
      // adjustment, and "1 mo" would read as a month of something.
      return line.amount >= 0 ? `${text} mo` : text;
    case "retainer":
    case "adhoc":
    case "build":
      return text;
    default:
      return assertNever(line.kind);
  }
}
