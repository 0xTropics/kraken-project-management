import { internalHandler, parseBody } from "@/lib/api/handler";
import { createTimeEntry, timeEntryCreateInput } from "@/lib/data/time";

export const POST = internalHandler(async ({ request, session }) => {
  const body = await parseBody(request, timeEntryCreateInput);
  return createTimeEntry(body, session);
});
