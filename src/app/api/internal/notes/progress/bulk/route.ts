import { z } from "zod";
import { internalHandler, parseBody } from "@/lib/api/handler";
import { uuid } from "@/lib/api/schemas";
import { appendAudit, userActor } from "@/lib/audit";
import { sql } from "@/lib/db/client";
import { notFound } from "@/lib/errors";

const bulkInput = z.object({
  ids: z.array(uuid).min(1, "Select at least one note").max(200),
  action: z.enum(["approve", "unapprove", "dismiss"]),
});

/** Bulk approve, unapprove or clear a screenful of notes at once. */
export const POST = internalHandler(async ({ request, session }) => {
  const { ids, action } = await parseBody(request, bulkInput);

  const affected = await sql.begin(async (tx) => {
    const rows =
      action === "dismiss"
        ? await tx<{ id: string; project_id: string }[]>`
            delete from progress_notes where id = any(${ids}::uuid[])
            returning id, project_id
          `
        : await tx<{ id: string; project_id: string }[]>`
            update progress_notes
            set approved_at = ${action === "approve" ? new Date() : null}
            where id = any(${ids}::uuid[])
            returning id, project_id
          `;

    if (rows.length > 0) {
      await appendAudit(
        {
          ...userActor(session),
          projectId: rows.every((r) => r.project_id === rows[0].project_id)
            ? rows[0].project_id
            : null,
          action: `progress_note.${action}`,
          entityType: "progress_note",
          entityId: rows.length === 1 ? rows[0].id : null,
          payload: { ids: rows.map((r) => r.id), count: rows.length },
        },
        tx,
      );
    }
    return rows;
  });

  if (affected.length === 0) throw notFound("Those notes no longer exist");
  return { affected: affected.length, ids: affected.map((r) => r.id) };
});
