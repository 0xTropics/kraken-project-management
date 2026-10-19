import { z } from "zod";
import { internalHandler, parseBody } from "@/lib/api/handler";
import { nonEmpty } from "@/lib/api/schemas";
import { appendAudit, userActor } from "@/lib/audit";
import { sql } from "@/lib/db/client";
import { badRequest, notFound } from "@/lib/errors";
import type { ProgressNote } from "@/lib/db/types";

type Params = { id: string };

const updateInput = z.object({
  approved: z.boolean().optional(),
  body: nonEmpty("Note body", 20_000).optional(),
});

/** Approve / unapprove is the only gate between a note and the portal. */
export const PATCH = internalHandler<Params>(async ({ request, params, session }) => {
  const input = await parseBody(request, updateInput);

  const patch: Record<string, unknown> = {};
  if (input.approved !== undefined) patch.approved_at = input.approved ? new Date() : null;
  if (input.body !== undefined) patch.body = input.body;
  if (Object.keys(patch).length === 0) throw badRequest("Nothing to update");

  const [note] = await sql<ProgressNote[]>`
    update progress_notes set ${sql(patch)} where id = ${params.id} returning *
  `;
  if (!note) throw notFound("That note no longer exists");

  await appendAudit({
    ...userActor(session),
    projectId: note.project_id,
    action:
      input.approved === undefined
        ? "progress_note.update"
        : input.approved
          ? "progress_note.approve"
          : "progress_note.unapprove",
    entityType: "progress_note",
    entityId: note.id,
    payload: { approved: note.approved_at !== null },
  });

  return { note };
});

/** Dismiss: a note that should never be seen again is removed outright. */
export const DELETE = internalHandler<Params>(async ({ params, session }) => {
  const [note] = await sql<ProgressNote[]>`
    delete from progress_notes where id = ${params.id} returning *
  `;
  if (!note) throw notFound("That note no longer exists");

  await appendAudit({
    ...userActor(session),
    projectId: note.project_id,
    action: "progress_note.dismiss",
    entityType: "progress_note",
    entityId: note.id,
    payload: { body: note.body.slice(0, 200) },
  });

  return { deleted: note.id };
});
