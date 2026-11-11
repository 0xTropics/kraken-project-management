import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "@/lib/db/client";
import { verifyLocalCredentials } from "@/lib/auth/internal";
import { setOperatorPassword } from "../../scripts/set-operator-password";
import { resetDatabase } from "../setup/factories";

const PASSWORD = "correct horse battery";

beforeEach(resetDatabase);

async function operator() {
  const [row] = await sql<{ id: string }[]>`
    insert into internal_users (email, name, supabase_uid)
    values ('operator@example.com', 'Morgan Hale', ${randomUUID()}) returning id`;
  if (!row) throw new Error("insert returned no row");
  return row.id;
}

describe("setOperatorPassword", () => {
  it("sets a password on a row that had none, keeping its id and supabase_uid", async () => {
    const id = await operator();
    expect(await setOperatorPassword("operator@example.com", PASSWORD)).toBe(id);
    const user = await verifyLocalCredentials("operator@example.com", PASSWORD);
    expect(user?.id).toBe(id);
    expect(user?.supabase_uid).not.toBeNull();
  });

  it("matches the email case-insensitively", async () => {
    const id = await operator();
    expect(await setOperatorPassword("Operator@Example.com", PASSWORD)).toBe(id);
  });

  it("replaces an existing password", async () => {
    await operator();
    await setOperatorPassword("operator@example.com", PASSWORD);
    await setOperatorPassword("operator@example.com", "a different passphrase");
    expect(await verifyLocalCredentials("operator@example.com", PASSWORD)).toBeNull();
    expect(await verifyLocalCredentials("operator@example.com", "a different passphrase")).not.toBeNull();
  });

  it("fails for an unknown email and creates no row", async () => {
    await expect(setOperatorPassword("nobody@example.com", PASSWORD)).rejects.toThrow(/No operator with that email/);
    const [row] = await sql<{ n: number }[]>`select count(*)::int as n from internal_users`;
    if (!row) throw new Error("count returned no row");
    expect(row.n).toBe(0);
  });

  it("rejects a short password without changing the row", async () => {
    await operator();
    await expect(setOperatorPassword("operator@example.com", "short")).rejects.toThrow(/at least 12 characters/);
    expect(await verifyLocalCredentials("operator@example.com", "short")).toBeNull();
  });
});
