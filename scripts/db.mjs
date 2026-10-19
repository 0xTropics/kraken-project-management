#!/usr/bin/env node
/**
 * Project-local Postgres cluster.
 *
 * Kraken's production database is Supabase Postgres. Development runs the same
 * engine locally -- a real PostgreSQL cluster living in .pgdata/ inside the
 * repo, on its own port, owned by nothing else on the machine. No Docker, no
 * system service, no shared `postgres` database to collide with.
 *
 *   node scripts/db.mjs start | stop | status | psql | nuke
 *
 * The only prerequisite is Postgres 15+ binaries on the machine. macOS:
 * `brew install postgresql@17`. Debian/Ubuntu: `apt install postgresql`.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, ".pgdata");
const PORT = process.env.LOCAL_DB_PORT ?? "54329";
const LOG = path.join(ROOT, ".pgdata", "server.log");

/** Finds pg_ctl without assuming a package manager or a PATH entry. */
function findBinDir() {
  const onPath = spawnSync("which", ["pg_ctl"], { encoding: "utf8" });
  if (onPath.status === 0 && onPath.stdout.trim()) {
    return path.dirname(onPath.stdout.trim());
  }
  const candidates = [];
  for (const prefix of ["/opt/homebrew/opt", "/usr/local/opt"]) {
    if (!existsSync(prefix)) continue;
    for (const entry of readdirSync(prefix)) {
      if (entry.startsWith("postgresql@")) candidates.push(path.join(prefix, entry, "bin"));
    }
  }
  for (const prefix of ["/usr/lib/postgresql", "/Applications/Postgres.app/Contents/Versions"]) {
    if (!existsSync(prefix)) continue;
    for (const entry of readdirSync(prefix)) {
      candidates.push(path.join(prefix, entry, "bin"));
    }
  }
  // Highest version wins.
  candidates.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const found = candidates.find((dir) => existsSync(path.join(dir, "pg_ctl")));
  if (!found) {
    console.error(
      "Could not find Postgres binaries (pg_ctl).\n" +
        "  macOS:  brew install postgresql@17\n" +
        "  Debian: sudo apt install postgresql\n" +
        "Then re-run this command.",
    );
    process.exit(1);
  }
  return found;
}

const BIN = findBinDir();
const bin = (name) => path.join(BIN, name);
const run = (name, args, opts = {}) =>
  execFileSync(bin(name), args, { stdio: "inherit", ...opts });

function isRunning() {
  const result = spawnSync(bin("pg_ctl"), ["-D", DATA_DIR, "status"], { encoding: "utf8" });
  return result.status === 0;
}

function start() {
  if (!existsSync(path.join(DATA_DIR, "PG_VERSION"))) {
    console.log("Initialising a fresh cluster in .pgdata ...");
    run("initdb", ["-D", DATA_DIR, "-U", "postgres", "--auth=trust", "-E", "UTF8"], {
      stdio: "ignore",
    });
  }
  if (isRunning()) {
    console.log(`Already running on port ${PORT}.`);
    return;
  }
  // No Unix socket: every client connects over TCP, and a socket inside the
  // repo breaks on a long clone path (Linux caps socket paths at 107 bytes).
  // pg_ctl runs -o through the shell, so the quotes make the value empty.
  try {
    run("pg_ctl", [
      "-D", DATA_DIR,
      "-l", LOG,
      "-o", `-p ${PORT} -c listen_addresses=127.0.0.1 -c unix_socket_directories=''`,
      "-w",
      "start",
    ]);
  } catch (error) {
    // pg_ctl only says "could not start server"; the reason is in the log.
    if (existsSync(LOG)) {
      const tail = readFileSync(LOG, "utf8").trimEnd().split("\n").slice(-20).join("\n");
      console.error(`\nLast lines of ${path.relative(ROOT, LOG)}:\n${tail}`);
    }
    process.exit(typeof error.status === "number" ? error.status : 1);
  }
  console.log(`\nDATABASE_URL=postgres://postgres@127.0.0.1:${PORT}/postgres`);
}

const command = process.argv[2] ?? "start";
switch (command) {
  case "start":
    start();
    break;
  case "stop":
    if (!isRunning()) {
      console.log("Not running.");
      break;
    }
    run("pg_ctl", ["-D", DATA_DIR, "-m", "fast", "-w", "stop"]);
    break;
  case "status":
    console.log(isRunning() ? `running on port ${PORT}` : "stopped");
    break;
  case "psql":
    run("psql", [`postgres://postgres@127.0.0.1:${PORT}/postgres`, ...process.argv.slice(3)]);
    break;
  case "nuke":
    if (isRunning()) run("pg_ctl", ["-D", DATA_DIR, "-m", "immediate", "-w", "stop"]);
    execFileSync("rm", ["-rf", DATA_DIR]);
    console.log("Cluster removed.");
    break;
  default:
    console.error(`Unknown command: ${command}`);
    process.exit(1);
}
