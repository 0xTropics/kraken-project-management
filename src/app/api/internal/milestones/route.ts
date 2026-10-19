import { internalHandler, parseBody } from "@/lib/api/handler";
import { milestoneInput, uuid } from "@/lib/api/schemas";
import { appendAudit, userActor } from "@/lib/audit";
import { sql } from "@/lib/db/client";
import { assertProjectExists } from "@/lib/data/projects";
import type { Milestone } from "@/lib/db/types";

const createInput = milestoneInput.extend({ project_id: uuid });

export const POST = internalHandler(async ({ request, session }) => {
  const input = await parseBody(request, createInput);

  await assertProjectExists(input.project_id);

  const [milestone] = await sql<Milestone[]>`
    insert into milestones ${sql({
      project_id: input.project_id,
      name: input.name,
      target_date: input.target_date ?? null,
      status: input.status ?? "open",
      client_visible: input.client_visible ?? true,
      sort_order: 0,
    })}
    returning *
  `;

  await appendAudit({
    ...userActor(session),
    projectId: input.project_id,
    action: "milestone.create",
    entityType: "milestone",
    entityId: milestone.id,
    payload: { name: milestone.name, target_date: milestone.target_date },
  });

  return { milestone };
});
