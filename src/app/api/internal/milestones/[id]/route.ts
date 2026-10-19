import { internalHandler, parseBody } from "@/lib/api/handler";
import { milestoneInput } from "@/lib/api/schemas";
import { appendAudit, userActor } from "@/lib/audit";
import { sql } from "@/lib/db/client";
import { badRequest, notFound } from "@/lib/errors";
import type { Milestone } from "@/lib/db/types";

type Params = { id: string };

const updateInput = milestoneInput.partial();

export const PATCH = internalHandler<Params>(async ({ request, params, session }) => {
  const input = await parseBody(request, updateInput);

  const patch = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  if (Object.keys(patch).length === 0) throw badRequest("Nothing to update");

  const [milestone] = await sql<Milestone[]>`
    update milestones set ${sql(patch)} where id = ${params.id} returning *
  `;
  if (!milestone) throw notFound("That milestone no longer exists");

  await appendAudit({
    ...userActor(session),
    projectId: milestone.project_id,
    action: "milestone.update",
    entityType: "milestone",
    entityId: milestone.id,
    payload: patch,
  });

  return { milestone };
});

/** Hard delete: work items fall back to `milestone_id is null` (on delete set null). */
export const DELETE = internalHandler<Params>(async ({ params, session }) => {
  const [milestone] = await sql<Milestone[]>`
    delete from milestones where id = ${params.id} returning *
  `;
  if (!milestone) throw notFound("That milestone no longer exists");

  await appendAudit({
    ...userActor(session),
    projectId: milestone.project_id,
    action: "milestone.delete",
    entityType: "milestone",
    entityId: milestone.id,
    payload: { name: milestone.name },
  });

  return { deleted: milestone.id };
});
