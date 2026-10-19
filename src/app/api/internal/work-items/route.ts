import { internalHandler, parseBody } from "@/lib/api/handler";
import { uuid, workItemCreateInput } from "@/lib/api/schemas";
import { appendAudit, userActor } from "@/lib/audit";
import { createWorkItem } from "@/lib/data/work-items";

/**
 * Work items, collection level.
 *
 * The project id comes from the body and is handed to the data module, which
 * re-reads the project and scopes every statement to it. A project id in a
 * request is a claim, not a fact -- `createWorkItem` turns a bad one into a 404
 * before any work-item row is touched.
 */

const createInput = workItemCreateInput.extend({ project_id: uuid });

export const POST = internalHandler(async ({ request, session }) => {
  const input = await parseBody(request, createInput);

  const item = await createWorkItem(input);

  await appendAudit({
    ...userActor(session),
    projectId: item.project_id,
    action: "work_item.create",
    entityType: "work_item",
    entityId: item.id,
    payload: {
      title: item.title,
      type: item.type,
      status: item.status,
      client_visible: item.client_visible,
    },
  });

  return item;
});
