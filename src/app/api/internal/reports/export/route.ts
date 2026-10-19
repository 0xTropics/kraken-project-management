import { NextResponse } from "next/server";
import { internalHandler } from "@/lib/api/handler";
import { badRequest } from "@/lib/errors";
import { resolveRange } from "@/components/reports/range";
import {
  getRevenueReport,
  getUtilizationReport,
  revenueCsv,
  utilizationCsv,
} from "@/lib/data/reports";

export const GET = internalHandler(async ({ searchParams }) => {
  const type = searchParams.get("type") ?? "revenue";
  if (type !== "revenue" && type !== "utilization") {
    throw badRequest("type must be revenue or utilization");
  }

  // The same reading of from/to as the reports page, so the export is always
  // the range on screen.
  const { from, to } = resolveRange(Object.fromEntries(searchParams));

  const csv =
    type === "revenue"
      ? revenueCsv(await getRevenueReport({ from, to }))
      : utilizationCsv(await getUtilizationReport({ from, to }));

  return new NextResponse(csv, {
    headers: {
      // The BOM makes Excel open UTF-8 correctly instead of mangling accents.
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="kraken-${type}-${from}-to-${to}.csv"`,
      "cache-control": "no-store",
    },
  });
});
