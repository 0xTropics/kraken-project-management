import { hash, verify } from "@node-rs/argon2";

/**
 * argon2id for the portal password and the local-mode operator
 * password. Parameters follow the OWASP Password Storage Cheat Sheet's argon2id
 * recommendation: 19 MiB memory, 2 iterations, parallelism 1.
 */
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(digest: string, plain: string): Promise<boolean> {
  try {
    return await verify(digest, plain, OPTIONS);
  } catch {
    // A malformed or truncated hash is a failed login, never a 500.
    return false;
  }
}
