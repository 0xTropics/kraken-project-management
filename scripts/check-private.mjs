#!/usr/bin/env node
/**
 * Fails if a term from the git-ignored `.private-terms` file (one per line, `#`
 * comments, case-insensitive) appears in a tracked file's contents or path.
 *
 *   node scripts/check-private.mjs          check every tracked file
 *   node scripts/check-private.mjs <file>   check only that file (commit-msg hook)
 *
 * No `.private-terms` -> exit 0, silently (CI, contributors, a tarball with no
 * .git). Never prints the terms list, only the lines and paths that hit.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const git = (args, cwd) => spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 1 << 28 });

const top = git(["rev-parse", "--show-toplevel"], process.cwd());
const root = top.status === 0 ? top.stdout.trim() : process.cwd();

const termsFile = path.join(root, ".private-terms");
if (!existsSync(termsFile)) process.exit(0);

const terms = readFileSync(termsFile, "utf8")
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));
if (terms.length === 0) process.exit(0);

const lower = terms.map((t) => t.toLowerCase());
const hits = [];
const fileArg = process.argv[2];

if (fileArg) {
  readFileSync(fileArg, "utf8")
    .split(/\r?\n/)
    .forEach((line, i) => {
      if (lower.some((t) => line.toLowerCase().includes(t))) hits.push(`${fileArg}:${i + 1}: ${line}`);
    });
} else {
  // One -e per term: `-f` would let a blank pattern match every line.
  const grep = git(["grep", "-n", "-I", "-i", "-F", ...terms.flatMap((t) => ["-e", t])], root);
  if (grep.status > 1) {
    console.error(`check-private: git grep failed: ${grep.stderr.trim()}`);
    process.exit(1);
  }
  hits.push(...grep.stdout.split("\n").filter(Boolean));

  const ls = git(["ls-files", "-z"], root);
  if (ls.status !== 0) {
    console.error(`check-private: git ls-files failed: ${ls.stderr.trim()}`);
    process.exit(1);
  }
  for (const p of ls.stdout.split("\0").filter(Boolean)) {
    if (lower.some((t) => p.toLowerCase().includes(t))) hits.push(`${p}: path matches a private term`);
  }
}

if (hits.length === 0) process.exit(0);
console.log(`check-private: ${hits.length} private-term hit(s)\n${hits.join("\n")}`);
process.exit(1);
