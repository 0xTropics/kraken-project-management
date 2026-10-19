import { internalHandler, parseBody } from "@/lib/api/handler";
import { declineRequestInput, UUID_RE } from "@/lib/api/schemas";
import { declineClientRequest } from "@/lib/data/client-requests";
import { notFound } from "@/lib/errors";

/** Decline, with an optional note the client sees. 409 if already decided. */
export const POST = internalHandler<{ id: string }>(async ({ request, params, session }) => {
  if (!UUID_RE.test(params.id)) throw notFound("That request no longer exists");
  const { note } = await parseBody(request, declineRequestInput);
  await declineClientRequest(params.id, note ?? null, session);
  return { ok: true };
});
