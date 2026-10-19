import { z } from "zod";
import { internalHandler, parseBody } from "@/lib/api/handler";
import { bulkUpdateWorkItems } from "@/lib/data/work-items";
import { WORK_ITEM_PRIORITIES, WORK_ITEM_STATUSES } from "@/lib/db/types";

const input = z.object({
  project_id: z.string().uuid(),
  ids: z.array(z.string().uuid()).min(1, "Select at least one item").max(500),
  action: z.discriminatedUnion("op", [
    z.object({ op: z.literal("status"), status: z.enum(WORK_ITEM_STATUSES) }),
    z.object({ op: z.literal("priority"), priority: z.enum(WORK_ITEM_PRIORITIES) }),
    z.object({ op: z.literal("milestone"), milestone_id: z.string().uuid().nullable() }),
    z.object({ op: z.literal("client_visible"), client_visible: z.boolean() }),
    z.object({ op: z.literal("delete") }),
  ]),
});

export const POST = internalHandler(async ({ request }) => {
  const body = await parseBody(request, input);
  return bulkUpdateWorkItems(body.project_id, body.ids, body.action);
});
