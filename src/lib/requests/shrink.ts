import { MAX_DIMENSION, encodeWithinBudget, fitWithin } from "./images";

/**
 * Resizes to at most MAX_DIMENSION on the longest side and re-encodes, which
 * also drops metadata such as GPS, stepping quality and size down until the
 * image fits CLIENT_IMAGE_BUDGET (see `encodeWithinBudget`). WebP where the
 * browser can encode it, JPEG otherwise -- checked on the blob's actual type,
 * because a browser that cannot encode WebP silently returns PNG instead. An
 * animated GIF becomes one frame.
 */
export async function shrinkImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const base = fitWithin(bitmap.width, bitmap.height, MAX_DIMENSION);

  try {
    return await encodeWithinBudget(async (scale, quality) => {
      const width = Math.max(1, Math.round(base.width * scale));
      const height = Math.max(1, Math.round(base.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser cannot prepare images for upload");
      context.drawImage(bitmap, 0, 0, width, height);

      const encode = (type: string) =>
        new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
      const webp = await encode("image/webp");
      if (webp && webp.type === "image/webp") return webp;
      const jpeg = await encode("image/jpeg");
      if (jpeg && jpeg.type === "image/jpeg") return jpeg;
      throw new Error("This browser cannot prepare images for upload");
    });
  } finally {
    bitmap.close();
  }
}
