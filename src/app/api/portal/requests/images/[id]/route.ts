import { NextResponse } from "next/server";
import { publicHandler } from "@/lib/api/handler";
import { UUID_RE } from "@/lib/api/schemas";
import { getPortalRequestImage, portalScopeFromRequest } from "@/lib/data/portal";
import { notFound } from "@/lib/errors";
import { storage } from "@/lib/storage";

/** The id is untrusted: matched against the cookie's project in one statement, 404 otherwise. */
export const GET = publicHandler<{ id: string }>(async ({ request, params }) => {
  const scope = await portalScopeFromRequest(request);
  if (!scope || !UUID_RE.test(params.id)) throw notFound();
  const image = await getPortalRequestImage(scope, params.id);
  if (!image) throw notFound();
  return NextResponse.redirect(await storage().signedUrl(image.storage_path, 60), 302);
});
