import { internalHandler, parseBody } from "@/lib/api/handler";
import { deleteTimeEntry, timeEntryUpdateInput, updateTimeEntry } from "@/lib/data/time";

export const PATCH = internalHandler<{ id: string }>(async ({ request, params, session }) => {
  const body = await parseBody(request, timeEntryUpdateInput);
  return updateTimeEntry(params.id, body, session);
});

export const DELETE = internalHandler<{ id: string }>(async ({ params, session }) => {
  await deleteTimeEntry(params.id, session);
  return null;
});
