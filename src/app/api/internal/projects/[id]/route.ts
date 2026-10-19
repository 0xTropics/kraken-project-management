import { internalHandler, parseBody } from "@/lib/api/handler";
import { projectUpdateInput } from "@/lib/api/schemas";
import { appendAudit, userActor } from "@/lib/audit";
import { sql } from "@/lib/db/client";
import { badRequest, notFound } from "@/lib/errors";
import { getProjectById, type ProjectWithClient } from "@/lib/data/projects";
import { assertBuildFeeCoversRecorded } from "@/lib/data/maintenance";
import { billingIssues } from "@/lib/projects/billing-rules";

type Params = { id: string };

export const PATCH = internalHandler<Params>(async ({ request, params, session }) => {
  const input = await parseBody(request, projectUpdateInput);

  const patch: Record<string, unknown> = Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== undefined),
  );
  if (Object.keys(patch).length === 0) throw badRequest("Nothing to update");

  const existing = await getProjectById(params.id);
  if (!existing) throw notFound("That project no longer exists");

  // Validate the row as it will be after the patch, not the patch alone: a
  // PATCH can carry one side of a pair (a lower monthly price against the old
  // prepay prices), and the check constraints judge the whole row.
  const merged = { ...existing, ...patch } as ProjectWithClient;
  const [issue] = billingIssues(merged);
  if (issue) throw badRequest(issue.message);
  if (merged.billing_model === "maintenance") {
    await assertBuildFeeCoversRecorded(params.id, merged.build_fee);
  }

  if (patch.status === "archived") patch.archived_at = new Date();
  if (patch.status !== undefined && patch.status !== "archived") patch.archived_at = null;

  await sql`update projects set ${sql(patch)} where id = ${params.id}`;

  await appendAudit({
    ...userActor(session),
    projectId: params.id,
    action: "project.update",
    entityType: "project",
    entityId: params.id,
    payload: patch,
  });

  return { project: await getProjectById(params.id) };
});

/** Archive: soft delete, so invoices and time entries keep their references. */
export const DELETE = internalHandler<Params>(async ({ params, session }) => {
  const [row] = await sql<{ id: string }[]>`
    update projects set status = 'archived', archived_at = now()
    where id = ${params.id} and archived_at is null
    returning id
  `;
  if (!row) throw notFound("That project no longer exists, or is already archived");

  await appendAudit({
    ...userActor(session),
    projectId: params.id,
    action: "project.archive",
    entityType: "project",
    entityId: params.id,
    payload: {},
  });

  return { project: await getProjectById(params.id) };
});
