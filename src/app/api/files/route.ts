import { NextResponse } from "next/server";
import { publicHandler } from "@/lib/api/handler";
import { storage, verifyObjectSignature } from "@/lib/storage";
import { forbidden, notFound } from "@/lib/errors";
import { env } from "@/lib/env";

/** What a stored object is served as, by extension. Anything else is not ours to serve. */
const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

/**
 * Serves a stored object in local storage mode, and only ever against a valid
 * signature. This is the local equivalent of a Supabase signed URL: the path,
 * the expiry, and the HMAC travel together, and an unsigned or expired request
 * gets nothing. There is no unsigned path.
 */
export const GET = publicHandler(async ({ searchParams }) => {
  if (env.storageMode !== "local") {
    // In Supabase mode the portal is handed a Storage signed URL directly, so
    // this route is not part of the download path at all.
    throw notFound();
  }

  const objectPath = searchParams.get("path");
  const expires = Number(searchParams.get("exp"));
  const signature = searchParams.get("sig");
  if (!objectPath || !signature || !Number.isFinite(expires)) {
    throw forbidden("This link is not valid");
  }
  if (!verifyObjectSignature(objectPath, expires, signature)) {
    throw forbidden("This link has expired or been altered");
  }

  const bytes = await storage().get(objectPath);
  if (!bytes) throw notFound("File not found");

  const filename = objectPath.split("/").pop() ?? "download.pdf";
  const contentType = CONTENT_TYPES[filename.split(".").pop()?.toLowerCase() ?? ""];
  if (!contentType) throw notFound("File not found");
  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "content-type": contentType,
      "content-disposition": `inline; filename="${filename}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
});
