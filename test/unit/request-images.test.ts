import { describe, expect, it } from "vitest";
import { CLIENT_IMAGE_BUDGET, encodeWithinBudget, fitWithin, sniffImage } from "@/lib/requests/images";

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

describe("sniffImage", () => {
  it("recognises each accepted type by signature", () => {
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toEqual({ contentType: "image/png", ext: "png" });
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toEqual({ contentType: "image/jpeg", ext: "jpg" });
    expect(sniffImage(bytes(...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBP")))).toEqual({ contentType: "image/webp", ext: "webp" });
    expect(sniffImage(bytes(...ascii("GIF89a")))).toEqual({ contentType: "image/gif", ext: "gif" });
    expect(sniffImage(bytes(...ascii("GIF87a")))).toEqual({ contentType: "image/gif", ext: "gif" });
  });

  it("refuses SVG, HTML, RIFF that is not WebP, and empty input", () => {
    expect(sniffImage(bytes(...ascii("<svg xmlns")))).toBeNull();
    expect(sniffImage(bytes(...ascii("<!doctype html>")))).toBeNull();
    expect(sniffImage(bytes(...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WAVE")))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });
});

describe("fitWithin", () => {
  it("leaves a small image alone", () => {
    expect(fitWithin(800, 600, 2000)).toEqual({ width: 800, height: 600 });
  });
  it("scales the longest side to the cap, keeping the ratio", () => {
    expect(fitWithin(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(1000, 5000, 2000)).toEqual({ width: 400, height: 2000 });
  });
  it("never returns a zero dimension", () => {
    expect(fitWithin(10000, 1, 2000)).toEqual({ width: 2000, height: 1 });
  });
});

describe("encodeWithinBudget", () => {
  const blobOf = (size: number) => new Blob([new Uint8Array(size)], { type: "image/webp" });

  it("returns the first encoding that fits, without degrading further", async () => {
    const calls: [number, number][] = [];
    const result = await encodeWithinBudget(async (scale, quality) => {
      calls.push([scale, quality]);
      return blobOf(500_000);
    }, 1_400_000);
    expect(result.size).toBe(500_000);
    expect(calls).toEqual([[1, 0.85]]);
  });

  it("steps quality down, then size, until it fits", async () => {
    const calls: [number, number][] = [];
    const result = await encodeWithinBudget(async (scale, quality) => {
      calls.push([scale, quality]);
      return blobOf(calls.length < 4 ? 3_000_000 : 1_000_000);
    }, 1_400_000);
    expect(result.size).toBe(1_000_000);
    expect(calls.length).toBe(4);
    expect(calls[3]?.[0]).toBeLessThan(1);
  });

  it("gives up with a readable error when nothing fits", async () => {
    await expect(encodeWithinBudget(async () => blobOf(9_000_000), 1_400_000)).rejects.toThrow(
      /too large to send/i,
    );
  });

  it("keeps three budgeted images and the longest text under Vercel's 4.5 MB body cap", () => {
    expect(3 * CLIENT_IMAGE_BUDGET + 3 * (200 + 5000 + 100) * 4 + 64 * 1024).toBeLessThan(4_500_000);
  });
});
