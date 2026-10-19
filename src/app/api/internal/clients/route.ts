import { z } from "zod";
import { internalHandler, parseBody } from "@/lib/api/handler";
import { clientInput } from "@/lib/api/schemas";
import { appendAudit, userActor } from "@/lib/audit";
import { sql } from "@/lib/db/client";
import { listClients, replaceClientContacts } from "@/lib/data/clients";
import type { Client } from "@/lib/db/types";

const listQuery = z.object({ archived: z.string().optional() });

export const GET = internalHandler(async ({ searchParams }) => {
  const { archived } = listQuery.parse(Object.fromEntries(searchParams));
  return { clients: await listClients(archived === "1") };
});

export const POST = internalHandler(async ({ request, session }) => {
  const input = await parseBody(request, clientInput);

  const { client, contacts } = await sql.begin(async (tx) => {
    const [row] = await tx<Client[]>`
      insert into clients ${tx({ name: input.name, notes: input.notes ?? null })}
      returning *
    `;
    if (!row) throw new Error("client insert returned no row");
    const saved = await replaceClientContacts(row.id, input.contacts, tx);
    return { client: row, contacts: saved };
  });

  await appendAudit({
    ...userActor(session),
    action: "client.create",
    entityType: "client",
    entityId: client.id,
    payload: { name: client.name, contacts: input.contacts },
  });

  return { client, contacts };
});
