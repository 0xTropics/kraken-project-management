import { NextResponse } from "next/server";
import { assertSameOrigin, publicHandler } from "@/lib/api/handler";
import { clientRequestInput } from "@/lib/api/schemas";
import { createPortalRequest, portalScopeFromRequest } from "@/lib/data/portal";
import { badRequest, unauthorized } from "@/lib/errors";
import { MAX_IMAGE_BYTES, MAX_IMAGES, sniffImage, type ImageKind } from "@/lib/requests/images";

/**
 * The portal's only write. The project comes from the cookie and nothing else;
 * a `project_id` field in the form is never read. Images are checked by count,
 * size and actual signature here, whatever the browser claims to have done.
 */
export const POST = publicHandler(async ({ request }) => {
  const scope = await portalScopeFromRequest(request);
  if (!scope) throw unauthorized("Sign in to the portal first");
  assertSameOrigin(request);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw badRequest("Expected a form submission");
  }

  const input = clientRequestInput.parse({
    title: form.get("title"),
    body: form.get("body"),
    requester_name: form.get("requester_name"),
  });

  const files = form.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_IMAGES) {
    throw badRequest(`Attach at most ${MAX_IMAGES} images`, "too_many_images");
  }

  const images: { bytes: Uint8Array; kind: ImageKind }[] = [];
  for (const file of files) {
    if (file.size > MAX_IMAGE_BYTES) {
      throw badRequest("Each image must be under 1.5 MB", "image_too_large");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = sniffImage(bytes);
    if (!kind) throw badRequest("Images must be PNG, JPEG, WebP or GIF", "image_type");
    images.push({ bytes, kind });
  }

  const created = await createPortalRequest(scope, input, images);
  return NextResponse.json({ request: created }, { status: 201 });
});
