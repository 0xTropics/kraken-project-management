import { internalHandler, parseBody } from "@/lib/api/handler";
import { projectNoteInput, uuid } from "@/lib/api/schemas";
import { appendAudit, userActor } from "@/lib/audit";
import { sql } from "@/lib/db/client";
import { assertProjectExists } from "@/lib/data/projects";
import type { ProjectNote } from "@/lib/db/types";

const createInput = projectNoteInput.extend({ project_id: uuid });

/** A long-lived project document. */
export const POST = internalHandler(async ({ request, session }) => {
  const input = await parseBody(request, createInput);

  await assertProjectExists(input.project_id);

  const [note] = await sql<ProjectNote[]>`
    insert into project_notes ${sql({
      project_id: input.project_id,
      title: input.title,
      body: input.body,
    })}
    returning *
  `;

  await appendAudit({
    ...userActor(session),
    projectId: input.project_id,
    action: "project_note.create",
    entityType: "project_note",
    entityId: note.id,
    payload: { title: note.title },
  });

  return { note };
});
