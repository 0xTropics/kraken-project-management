/**
 * Image rules shared by the portal form (browser) and the upload route
 * (server). Nothing here imports node: the form bundles it.
 *
 * The browser shrinks every image before upload because Vercel rejects request
 * bodies over 4.5 MB; the server never trusts that it did, and re-checks count,
 * size and the file's actual signature.
 */
export const MAX_IMAGES = 3;
export const MAX_IMAGE_BYTES = 1_572_864;
/**
 * What the browser aims for per image. Below the server's MAX_IMAGE_BYTES so
 * three images plus the longest text still fit under Vercel's 4.5 MB request
 * body cap, which the server limit alone does not guarantee.
 */
export const CLIENT_IMAGE_BUDGET = 1_400_000;
export const MAX_ORIGINAL_BYTES = 15 * 1024 * 1024;
export const MAX_DIMENSION = 2000;
export const DAILY_REQUEST_LIMIT = 10;
export const ACCEPTED_ORIGINAL_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

export type ImageKind =
  | { contentType: "image/png"; ext: "png" }
  | { contentType: "image/jpeg"; ext: "jpg" }
  | { contentType: "image/webp"; ext: "webp" }
  | { contentType: "image/gif"; ext: "gif" };

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((value, index) => bytes[offset + index] === value);
}

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** The type the bytes actually are, or null. The client's claimed type is never consulted. */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { contentType: "image/png", ext: "png" };
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { contentType: "image/jpeg", ext: "jpg" };
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) {
    return { contentType: "image/webp", ext: "webp" };
  }
  if (startsWith(bytes, ascii("GIF87a")) || startsWith(bytes, ascii("GIF89a"))) {
    return { contentType: "image/gif", ext: "gif" };
  }
  return null;
}

/** Scales (width, height) so the longer side is at most `max`, keeping the ratio. */
export function fitWithin(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const scale = max / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Quality first, then dimensions: a screenshot keeps its pixels if it can. */
const ATTEMPTS: [scale: number, quality: number][] = [
  [1, 0.85],
  [1, 0.7],
  [1, 0.55],
  [0.75, 0.7],
  [0.5, 0.7],
  [0.35, 0.6],
];

/**
 * Re-encodes until the result fits the budget, trying each (scale, quality)
 * step in turn. `encode` does the drawing; this only decides what to ask for,
 * which keeps the policy testable without a canvas.
 */
export async function encodeWithinBudget(
  encode: (scale: number, quality: number) => Promise<Blob | null>,
  budget: number = CLIENT_IMAGE_BUDGET,
): Promise<Blob> {
  for (const [scale, quality] of ATTEMPTS) {
    const blob = await encode(scale, quality);
    if (blob && blob.size <= budget) return blob;
  }
  throw new Error("That image is too large to send, even reduced — try a smaller screenshot.");
}
