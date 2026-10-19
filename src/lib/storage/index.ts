import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";

/**
 * Invoice PDFs. Production stores them in a private Supabase Storage bucket and
 * hands the portal a short-lived signed URL. Development without a cloud
 * project stores them under .storage/ and signs an equivalent short-lived URL
 * with the same secret the portal cookie uses -- same contract, same expiry
 * semantics, same "the portal never gets a durable link" property.
 */
export interface StorageAdapter {
  put(objectPath: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(objectPath: string): Promise<Uint8Array | null>;
  signedUrl(objectPath: string, expiresInSeconds: number): Promise<string>;
}

/* -------------------------------------------------------------------------- */

function supabaseAdapter(): StorageAdapter {
  const load = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(env.supabaseUrl, env.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }).storage.from(env.storageBucket);
  };

  return {
    async put(objectPath, bytes, contentType) {
      const bucket = await load();
      const { error } = await bucket.upload(objectPath, bytes, {
        contentType,
        upsert: true,
      });
      if (error) throw new Error(`Storage upload failed: ${error.message}`);
    },
    async get(objectPath) {
      const bucket = await load();
      const { data, error } = await bucket.download(objectPath);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    },
    async signedUrl(objectPath, expiresInSeconds) {
      const bucket = await load();
      const { data, error } = await bucket.createSignedUrl(objectPath, expiresInSeconds);
      if (error || !data) throw new Error(`Signed URL failed: ${error?.message ?? "unknown"}`);
      return data.signedUrl;
    },
  };
}

/* -------------------------------------------------------------------------- */

function localRoot(): string {
  return path.resolve(process.cwd(), env.localStorageDir);
}

/** Rejects traversal before any path is joined against the storage root. */
function safeJoin(objectPath: string): string {
  const resolved = path.resolve(localRoot(), objectPath);
  const root = localRoot();
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error("Refusing to access a path outside the storage root");
  }
  return resolved;
}

function localAdapter(): StorageAdapter {
  return {
    async put(objectPath, bytes, _contentType) {
      void _contentType;
      const target = safeJoin(objectPath);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes);
    },
    async get(objectPath) {
      try {
        return new Uint8Array(await readFile(safeJoin(objectPath)));
      } catch {
        return null;
      }
    },
    async signedUrl(objectPath, expiresInSeconds) {
      const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
      const signature = signObjectPath(objectPath, expires);
      const params = new URLSearchParams({
        path: objectPath,
        exp: String(expires),
        sig: signature,
      });
      return `${env.appUrl}/api/files?${params.toString()}`;
    },
  };
}

export function signObjectPath(objectPath: string, expires: number): string {
  return createHmac("sha256", env.sessionSecret)
    .update(`${objectPath}:${expires}`)
    .digest("hex");
}

export function verifyObjectSignature(
  objectPath: string,
  expires: number,
  signature: string,
): boolean {
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(signObjectPath(objectPath, expires), "hex");
  const provided = Buffer.from(signature, "hex");
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

export function storage(): StorageAdapter {
  return env.storageMode === "supabase" ? supabaseAdapter() : localAdapter();
}

/** Where an invoice's PDF lives: `invoices/<project_id>/<number>.pdf`. */
export function invoicePdfPath(projectId: string, number: string): string {
  return `invoices/${projectId}/${number}.pdf`;
}

/** `requests/<project_id>/<request_id>/<image_id>.<ext>`; the extension comes from the sniffed signature. */
export function requestImagePath(
  projectId: string,
  requestId: string,
  imageId: string,
  ext: string,
): string {
  return `requests/${projectId}/${requestId}/${imageId}.${ext}`;
}
