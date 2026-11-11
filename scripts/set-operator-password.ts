/**
 * Set the local-mode password for an existing operator.
 * Usage: npm run operator:password -- <email>
 * On a TTY the password is read without echo and asked twice; otherwise one
 * line is read from stdin. Neither the password nor the hash is printed.
 */
import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline";
import { hashPassword } from "@/lib/auth/password";
import { sql } from "@/lib/db/client";

const MIN_LENGTH = 12;

export async function setOperatorPassword(email: string, password: string): Promise<string> {
  if (password.length < MIN_LENGTH) {
    throw new Error(`Password must be at least ${MIN_LENGTH} characters`);
  }
  const digest = await hashPassword(password);
  const [row] = await sql<{ id: string }[]>`
    update internal_users set password_hash = ${digest}
    where lower(email) = lower(${email})
    returning id
  `;
  if (!row) throw new Error("No operator with that email");
  return row.id;
}

/** Read one line from a TTY with echo off. Ctrl-C aborts. */
function promptHidden(label: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const { stdin, stderr } = process;
    stderr.write(label);
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const done = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      stderr.write("\n");
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          done();
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          done();
          reject(new Error("Cancelled"));
          return;
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function readLine(): Promise<string> {
  const rl = createInterface({ input: process.stdin });
  try {
    for await (const line of rl) return line;
    return "";
  } finally {
    rl.close();
  }
}

async function readPassword(): Promise<string> {
  if (!process.stdin.isTTY) return readLine();
  const first = await promptHidden("New password: ");
  const second = await promptHidden("Repeat password: ");
  if (first !== second) throw new Error("Passwords do not match");
  return first;
}

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("Usage: npm run operator:password -- <email>");
  try {
    await setOperatorPassword(email, await readPassword());
    console.log(`Password updated for ${email}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Only when run directly: the tests import setOperatorPassword.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error("\nFailed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
