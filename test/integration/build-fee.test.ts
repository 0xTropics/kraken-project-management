import { beforeEach, describe, expect, it } from "vitest";
import { assertManualChargeKind, cancelCharge, listUnbilledCharges } from "@/lib/data/charges";
import { assertBuildFeeCoversRecorded, getBuildFeeProgress } from "@/lib/data/maintenance";
import { today } from "@/lib/format";
import { billInstallment, finalizeInvoice, voidInvoice } from "@/lib/invoices/engine";
import { createInternalUser, createProject, resetDatabase } from "../setup/factories";

let actorId: string;

beforeEach(async () => {
  await resetDatabase();
  actorId = (await createInternalUser()).id;
});

function buildProject(buildFee: number | null = 5000) {
  return createProject({ billing_model: "maintenance", maintenance_monthly: 150, build_fee: buildFee });
}

describe("billInstallment", () => {
  it("records the installment and drafts it as a build line dated today", async () => {
    const project = await buildProject();
    const draft = await billInstallment(project.id, { amount: 2500, description: "50% on signing" }, actorId);

    expect([draft.period_start, draft.period_end]).toEqual([today(), today()]);
    expect(draft.lines).toHaveLength(1);
    expect(draft.lines[0]).toMatchObject({
      kind: "build",
      description: `${today()} — 50% on signing`,
      amount: 2500,
      taxable: true,
    });
    expect(draft.lines[0]?.charge_id).not.toBeNull();
  });

  it("tracks recorded, invoiced and left to bill", async () => {
    const project = await buildProject();
    const draft = await billInstallment(project.id, { amount: 2500, description: "50% on signing" }, actorId);
    expect(await getBuildFeeProgress(project.id)).toMatchObject({
      build_fee: 5000, recorded: 2500, invoiced: 0, left: 2500,
    });

    await finalizeInvoice(draft.id, actorId);
    expect(await getBuildFeeProgress(project.id)).toMatchObject({ recorded: 2500, invoiced: 2500, left: 2500 });
  });

  it("refuses an installment above what is left, to the cent", async () => {
    const project = await buildProject();
    await billInstallment(project.id, { amount: 2500, description: "50% on signing" }, actorId);

    await expect(billInstallment(project.id, { amount: 2500.01, description: "Too much" }, actorId)).rejects.toMatchObject({
      code: "build_fee_exceeded",
    });
    await billInstallment(project.id, { amount: 2500, description: "50% at launch" }, actorId);
    expect((await getBuildFeeProgress(project.id)).left).toBe(0);
    await expect(billInstallment(project.id, { amount: 0.01, description: "More" }, actorId)).rejects.toMatchObject({
      code: "build_fee_exceeded",
    });
  });

  it("refuses a project with no build fee, or not build + maintenance", async () => {
    const noFee = await buildProject(null);
    await expect(billInstallment(noFee.id, { amount: 100, description: "x" }, actorId)).rejects.toMatchObject({ code: "not_maintenance" });
    const hourly = await createProject({ billing_model: "hourly" });
    await expect(billInstallment(hourly.id, { amount: 100, description: "x" }, actorId)).rejects.toMatchObject({ code: "not_maintenance" });
  });

  it("returns a voided installment to unbilled without freeing the build fee", async () => {
    const project = await buildProject();
    const draft = await billInstallment(project.id, { amount: 2500, description: "50% on signing" }, actorId);
    await finalizeInvoice(draft.id, actorId);
    await voidInvoice(draft.id, actorId);

    expect((await listUnbilledCharges(project.id)).map((c) => c.kind)).toEqual(["build"]);
    expect(await getBuildFeeProgress(project.id)).toMatchObject({ recorded: 2500, invoiced: 0, left: 2500 });
  });

  // Review Focus 3.
  it("stores a sub-cent amount as the same cents the cap judged", async () => {
    const project = await buildProject(1234.57);
    const draft = await billInstallment(project.id, { amount: 1234.567, description: "All of it" }, actorId);
    expect(draft.lines[0]?.amount).toBe(1234.57);
    expect((await getBuildFeeProgress(project.id)).left).toBe(0);
  });
});

describe("build fee guards", () => {
  it("keeps build charges off the generic charges route", () => {
    expect(() => assertManualChargeKind("build")).toThrow(expect.objectContaining({ code: "use_build_installment" }));
    expect(() => assertManualChargeKind("fixed")).not.toThrow();
  });

  it("refuses a build fee below what is already recorded", async () => {
    const project = await buildProject();
    await billInstallment(project.id, { amount: 2500, description: "50% on signing" }, actorId);

    await expect(assertBuildFeeCoversRecorded(project.id, 2000)).rejects.toMatchObject({ code: "build_fee_below_recorded" });
    await expect(assertBuildFeeCoversRecorded(project.id, null)).rejects.toMatchObject({ code: "build_fee_below_recorded" });
    await assertBuildFeeCoversRecorded(project.id, 2500);
  });

  it("lets a project with nothing recorded drop its build fee", async () => {
    const project = await buildProject();
    await assertBuildFeeCoversRecorded(project.id, null);
  });
});

describe("a mistyped installment that was issued and then voided", () => {
  // Final review, Important 2: its void line blocks deletion (on delete
  // restrict), so it re-swept onto every draft and held the cap forever.
  it("can be cancelled, which stops it sweeping and frees the build fee", async () => {
    const project = await buildProject(9000);
    const wrong = await billInstallment(project.id, { amount: 3000, description: "Meant 300" }, actorId);
    await finalizeInvoice(wrong.id, actorId);
    await voidInvoice(wrong.id, actorId);
    const chargeId = wrong.lines[0]?.charge_id;
    if (!chargeId) throw new Error("installment line has no charge");

    await cancelCharge(chargeId);

    expect(await listUnbilledCharges(project.id)).toEqual([]);
    expect(await getBuildFeeProgress(project.id)).toMatchObject({ recorded: 0, invoiced: 0, left: 9000 });
    const right = await billInstallment(project.id, { amount: 300, description: "Deposit" }, actorId);
    expect(right.total).toBe(300);
    await billInstallment(project.id, { amount: 8700, description: "The rest" }, actorId);
    expect((await getBuildFeeProgress(project.id)).left).toBe(0);
  });

  it("refuses to cancel a charge that is on a live invoice", async () => {
    const project = await buildProject();
    const draft = await billInstallment(project.id, { amount: 2500, description: "50% on signing" }, actorId);
    const chargeId = draft.lines[0]?.charge_id;
    if (!chargeId) throw new Error("installment line has no charge");
    await expect(cancelCharge(chargeId)).rejects.toMatchObject({ code: "charge_already_billed" });
  });
});
