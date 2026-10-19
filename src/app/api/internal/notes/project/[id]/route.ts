import { internalHandler, parseBody } from "@/lib/api/handler";
import { projectNoteInput } from "@/lib/api/schemas";
import { appendAudit, userActor } from "@/lib/audit";
import { sql } from "@/lib/db/client";
import { badRequest, notFound } from "@/lib/errors";
import type { ProjectNote } from "@/lib/db/types";

type Params = { id: string };

const updateInput = projectNoteInput.partial();

export const PATCH = internalHandler<Params>(async ({ request, params, session }) => {
  const input = await parseBody(request, updateInput);

  const patch = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  if (Object.keys(patch).length === 0) throw badRequest("Nothing to update");

  const [note] = await sql<ProjectNote[]>`
    update project_notes set ${sql(patch)} where id = ${params.id} returning *
  `;
  if (!note) throw notFound("That note no longer exists");

  await appendAudit({
    ...userActor(session),
    projectId: note.project_id,
    action: "project_note.update",
    entityType: "project_note",
    entityId: note.id,
    payload: { title: note.title },
  });

  return { note };
});

export const DELETE = internalHandler<Params>(async ({ params, session }) => {
  const [note] = await sql<ProjectNote[]>`
    delete from project_notes where id = ${params.id} returning *
  `;
  if (!note) throw notFound("That note no longer exists");

  await appendAudit({
    ...userActor(session),
    projectId: note.project_id,
    action: "project_note.delete",
    entityType: "project_note",
    entityId: note.id,
    payload: { title: note.title },
  });

  return { deleted: note.id };
});
