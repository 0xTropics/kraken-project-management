import { z } from "zod";
import { internalHandler, parseBody } from "@/lib/api/handler";
import { moveWorkItem } from "@/lib/data/work-items";
import { WORK_ITEM_STATUSES } from "@/lib/db/types";

/** Board drag-and-drop: one item changes column, and the column is re-ordered. */
const input = z.object({
  project_id: z.string().uuid(),
  id: z.string().uuid(),
  status: z.enum(WORK_ITEM_STATUSES),
  ordered_ids: z.array(z.string().uuid()).max(1000).default([]),
});

export const POST = internalHandler(async ({ request }) => {
  const body = await parseBody(request, input);
  return moveWorkItem(body.project_id, body.id, body.status, body.ordered_ids);
});
