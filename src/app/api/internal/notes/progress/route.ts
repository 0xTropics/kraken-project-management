import { internalHandler, parseBody } from "@/lib/api/handler";
import { progressNoteInput, uuid } from "@/lib/api/schemas";
import { appendAudit, userActor } from "@/lib/audit";
import { sql } from "@/lib/db/client";
import { assertProjectExists } from "@/lib/data/projects";
import type { ProgressNote } from "@/lib/db/types";

const createInput = progressNoteInput.extend({ project_id: uuid });

/**
 * A progress note written by the operator. It is approved by default: a note
 * the operator typed is already reviewed.
 */
export const POST = internalHandler(async ({ request, session }) => {
  const input = await parseBody(request, createInput);

  await assertProjectExists(input.project_id);

  const approved = input.approved ?? true;
  const [note] = await sql<ProgressNote[]>`
    insert into progress_notes ${sql({
      project_id: input.project_id,
      work_item_id: input.work_item_id ?? null,
      body: input.body,
      approved_at: approved ? new Date() : null,
    })}
    returning *
  `;

  await appendAudit({
    ...userActor(session),
    projectId: input.project_id,
    action: "progress_note.create",
    entityType: "progress_note",
    entityId: note.id,
    payload: { approved, work_item_id: note.work_item_id },
  });

  return { note };
});
