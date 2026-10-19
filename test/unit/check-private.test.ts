import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = path.resolve(__dirname, "../../scripts/check-private.mjs");

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A throwaway directory; `files` are written, and `git add`ed when `git` is true. */
function sandbox(files: Record<string, string>, { git = true, terms }: { git?: boolean; terms?: string } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "check-private-"));
  dirs.push(dir);
  if (git) spawnSync("git", ["init", "-q"], { cwd: dir });
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), body);
  }
  // .private-terms is written but never added, as in the real repo (it is git-ignored).
  if (terms !== undefined) writeFileSync(path.join(dir, ".private-terms"), terms);
  if (git) spawnSync("git", ["add", ...Object.keys(files)], { cwd: dir });
  return dir;
}

function run(cwd: string, ...args: string[]) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe("check-private", () => {
  it("passes silently when there is no .private-terms file", () => {
    const dir = sandbox({ "notes.md": "Acme Hidden Co" });
    expect(run(dir)).toMatchObject({ status: 0, stdout: "" });
  });

  it("passes silently outside a git repository", () => {
    const dir = sandbox({ "notes.md": "Acme Hidden Co" }, { git: false });
    expect(run(dir)).toMatchObject({ status: 0, stdout: "" });
  });

  it("fails on a tracked file containing a term, case-insensitively", () => {
    const dir = sandbox({ "notes.md": "Acme Hidden Co" }, { terms: "acme hidden\n" });
    const r = run(dir);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("notes.md");
  });

  it("fails on a tracked path containing a term", () => {
    const dir = sandbox({ "docs/acme-hidden.md": "nothing to see" }, { terms: "acme-hidden\n" });
    const r = run(dir);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("docs/acme-hidden.md");
  });

  it("ignores blank lines and # comments in the terms file", () => {
    const dir = sandbox({ "notes.md": "a clean file\n# comment\n" }, { terms: "\n# comment\n\nzzz-not-present\n" });
    expect(run(dir)).toMatchObject({ status: 0, stdout: "" });
  });

  it("checks only the given file when passed a path", () => {
    const dir = sandbox({ "notes.md": "Acme Hidden Co" }, { terms: "acme hidden\n" });
    writeFileSync(path.join(dir, "msg.txt"), "feat: bill Acme Hidden Co\n");
    const hit = run(dir, "msg.txt");
    expect(hit.status).toBe(1);
    expect(hit.stdout).toContain("msg.txt");
    expect(hit.stdout).not.toContain("notes.md");

    writeFileSync(path.join(dir, "msg.txt"), "feat: nothing private\n");
    expect(run(dir, "msg.txt")).toMatchObject({ status: 0, stdout: "" });
  });
});
