import { internalHandler, parseBody } from "@/lib/api/handler";
import { clientUpdateInput } from "@/lib/api/schemas";
import { appendAudit, userActor } from "@/lib/audit";
import { sql } from "@/lib/db/client";
import { conflict, notFound } from "@/lib/errors";
import { replaceClientContacts } from "@/lib/data/clients";
import type { Client, ClientContact } from "@/lib/db/types";

type Params = { id: string };

export const PATCH = internalHandler<Params>(async ({ request, params, session }) => {
  const input = await parseBody(request, clientUpdateInput);

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.archived !== undefined) patch.archived_at = input.archived ? new Date() : null;

  if (Object.keys(patch).length === 0 && input.contacts === undefined) {
    throw conflict("Nothing to update");
  }

  const { client, contacts } = await sql.begin(async (tx) => {
    let row: Client | undefined;
    if (Object.keys(patch).length > 0) {
      [row] = await tx<Client[]>`
        update clients set ${tx(patch)} where id = ${params.id} returning *`;
    } else {
      [row] = await tx<Client[]>`select * from clients where id = ${params.id}`;
    }
    if (!row) throw notFound("That client no longer exists");
    const saved =
      input.contacts === undefined
        ? await tx<ClientContact[]>`
            select * from client_contacts where client_id = ${row.id}
            order by is_primary desc, created_at, id`
        : await replaceClientContacts(row.id, input.contacts, tx);
    return { client: row, contacts: saved };
  });

  await appendAudit({
    ...userActor(session),
    action: input.archived === undefined ? "client.update" : input.archived ? "client.archive" : "client.restore",
    entityType: "client",
    entityId: client.id,
    payload: input.contacts === undefined ? patch : { ...patch, contacts: input.contacts },
  });

  return { client, contacts };
});
