import { internalHandler } from "@/lib/api/handler";
import { UUID_RE } from "@/lib/api/schemas";
import { acceptClientRequest } from "@/lib/data/client-requests";
import { notFound } from "@/lib/errors";

/** Accept: creates the linked backlog item. 409 if the request was already decided. */
export const POST = internalHandler<{ id: string }>(async ({ params, session }) => {
  if (!UUID_RE.test(params.id)) throw notFound("That request no longer exists");
  return acceptClientRequest(params.id, session);
});
