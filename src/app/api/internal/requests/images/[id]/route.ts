import { NextResponse } from "next/server";
import { internalHandler } from "@/lib/api/handler";
import { UUID_RE } from "@/lib/api/schemas";
import { sql } from "@/lib/db/client";
import { notFound } from "@/lib/errors";
import { storage } from "@/lib/storage";

/** A request image for the operator, behind a short-lived signed URL like the portal's. */
export const GET = internalHandler<{ id: string }>(async ({ params }) => {
  if (!UUID_RE.test(params.id)) throw notFound();
  const [image] = await sql<{ storage_path: string }[]>`
    select storage_path from client_request_images where id = ${params.id}
  `;
  if (!image) throw notFound();
  return NextResponse.redirect(await storage().signedUrl(image.storage_path, 60), 302);
});
