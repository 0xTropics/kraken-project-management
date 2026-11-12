import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPTS = path.resolve(__dirname, "../../scripts/selfhost");
const SERVICE = "gui/501/kraken.app";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/**
 * Every stub appends "<name> <args>" to $STUB_LOG and fails when STUB_FAIL equals
 * either that line or the bare name. A few record extra facts to side files.
 */
const STUB = `#!/bin/sh
name=$(basename "$0")
line="$name $*"
echo "$line" >> "$STUB_LOG"
case "$name" in
  node) echo "NODE_ENV=$NODE_ENV TZ=$TZ cwd=$(pwd -P)" >> "$STUB_LOG.node" ;;
  npm) pwd -P >> "$STUB_LOG.cwd" ;;
  launchctl) readlink "$KRAKEN_HOME/current" >> "$STUB_LOG.kick" ;;
  pg_dump)
    file=""
    for a in "$@"; do case "$a" in --file=*) file="\${a#--file=}" ;; esac; done
    if [ -n "$file" ]; then
      if [ "\${STUB_FAIL:-}" = "pg_dump" ] || [ -n "\${STUB_KILL_PARENT:-}" ]; then echo "partial" > "$file"; else echo "dump" > "$file"; fi
    fi
    # Simulates the service manager stopping the backup mid-dump.
    if [ -n "\${STUB_KILL_PARENT:-}" ]; then kill -TERM "$PPID"; fi
    ;;
esac
if [ "\${STUB_FAIL:-}" = "$line" ] || [ "\${STUB_FAIL:-}" = "$name" ]; then exit 1; fi
exit 0
`;

type Box = ReturnType<typeof makeBox>;

function git(cwd: string, ...args: string[]) {
  const r = spawnSync(
    "git",
    ["-c", "user.name=Morgan Hale", "-c", "user.email=operator@example.com", ...args],
    { cwd, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" } },
  );
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

function makeBox(envLines: string[] = []) {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "selfhost-")));
  dirs.push(root);
  const home = path.join(root, "home");
  const stubs = path.join(root, "stubs");
  const log = path.join(root, "stub.log");
  const backups = path.join(home, "backups");
  for (const d of [home, stubs, path.join(home, "releases"), backups]) mkdirSync(d, { recursive: true });
  writeFileSync(log, "");
  for (const n of ["npm", "launchctl", "pg_dump", "node"]) {
    writeFileSync(path.join(stubs, n), STUB);
    chmodSync(path.join(stubs, n), 0o755);
  }
  writeFileSync(
    path.join(home, "kraken.env"),
    [
      `KRAKEN_SERVICE="${SERVICE}"`,
      `KRAKEN_BACKUP_DIR="${backups}"`,
      `KRAKEN_APP_URL="https://kraken.example"`,
      `DATABASE_URL="postgres://kraken:secret@localhost:5432/kraken"`,
      ...envLines,
      "",
    ].join("\n"),
  );

  const box = {
    root,
    home,
    log,
    backups,
    lines: () => readFileSync(log, "utf8").split("\n").filter(Boolean),
    side: (ext: string) =>
      existsSync(`${log}.${ext}`) ? readFileSync(`${log}.${ext}`, "utf8").split("\n").filter(Boolean) : [],
    run(script: string, env: Record<string, string | undefined> = {}) {
      const e: Record<string, string | undefined> = {
        ...process.env,
        KRAKEN_HOME: home,
        STUB_LOG: log,
        PATH: `${stubs}:${process.env.PATH}`,
        GIT_CONFIG_GLOBAL: "/dev/null",
        ...env,
      };
      for (const k of Object.keys(e)) if (e[k] === undefined) delete e[k];
      const r = spawnSync("bash", [path.join(SCRIPTS, script)], {
        cwd: root,
        encoding: "utf8",
        env: e as NodeJS.ProcessEnv,
      });
      return { status: r.status, stdout: r.stdout, stderr: r.stderr };
    },
    current: () => {
      try {
        return readlinkSync(path.join(home, "current"));
      } catch {
        return null;
      }
    },
    releases: () => readdirSync(path.join(home, "releases")).sort(),
  };
  return box;
}

/** A box with a bare origin holding one commit on main, cloned to $KRAKEN_HOME/repo. */
function makeDeployBox() {
  const box = makeBox();
  const origin = path.join(box.root, "origin.git");
  const work = path.join(box.root, "work");
  git(box.root, "init", "-q", "--bare", "-b", "main", origin);
  git(box.root, "init", "-q", "-b", "main", work);
  git(work, "remote", "add", "origin", origin);
  let n = 0;
  const commit = () => {
    n += 1;
    writeFileSync(path.join(work, "file.txt"), `version ${n}\n`);
    git(work, "add", "file.txt");
    git(work, "commit", "-q", "-m", `change ${n}`);
    git(work, "push", "-q", "origin", "main");
    return git(work, "rev-parse", "HEAD");
  };
  const first = commit();
  git(box.root, "clone", "-q", origin, path.join(box.home, "repo"));
  return { ...box, commit, first, rel: (sha: string) => path.join(box.home, "releases", sha) };
}

function makeCurrent(box: Box) {
  const rel = path.join(box.home, "releases", "abc");
  mkdirSync(rel, { recursive: true });
  symlinkSync(rel, path.join(box.home, "current"));
  return rel;
}

describe("lib.sh", () => {
  const source = (env: Record<string, string | undefined>) => {
    const e = { ...process.env, ...env } as Record<string, string | undefined>;
    for (const k of Object.keys(e)) if (e[k] === undefined) delete e[k];
    const r = spawnSync("bash", ["-c", `set -euo pipefail; . "${SCRIPTS}/lib.sh"; echo sourced`], {
      encoding: "utf8",
      env: e as NodeJS.ProcessEnv,
    });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
  };

  it("fails naming KRAKEN_HOME when it is unset", () => {
    const r = source({ KRAKEN_HOME: undefined });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("KRAKEN_HOME");
    expect(r.stdout).not.toContain("sourced");
  });

  it("fails naming kraken.env when the file is missing", () => {
    const empty = realpathSync(mkdtempSync(path.join(os.tmpdir(), "selfhost-")));
    dirs.push(empty);
    const r = source({ KRAKEN_HOME: empty });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("kraken.env");
    expect(r.stdout).not.toContain("sourced");
  });
});

describe("start.sh", () => {
  it("execs next start on 127.0.0.1 with NODE_ENV=production and TZ=UTC", () => {
    const box = makeBox([`PORT="3456"`, `NODE_ENV="development"`, `TZ="America/Vancouver"`]);
    const rel = makeCurrent(box);
    const r = box.run("start.sh");
    expect(r.status).toBe(0);
    expect(box.lines()).toEqual([
      "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3456",
    ]);
    expect(box.side("node")).toEqual([`NODE_ENV=production TZ=UTC cwd=${rel}`]);
  });

  it("defaults the port to 3100 when PORT is not set", () => {
    const box = makeBox();
    makeCurrent(box);
    expect(box.run("start.sh", { PORT: undefined }).status).toBe(0);
    expect(box.lines()[0]).toMatch(/--hostname 127\.0\.0\.1 --port 3100$/);
  });

  it("refuses http://kraken.example with a message naming KRAKEN_APP_URL, and starts nothing", () => {
    const box = makeBox([`KRAKEN_APP_URL="http://kraken.example"`]);
    makeCurrent(box);
    const r = box.run("start.sh");
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain(
      "KRAKEN_APP_URL must be https: the session cookie is not sent over plain http",
    );
    expect(box.lines()).toEqual([]);
  });

  it("refuses an empty KRAKEN_APP_URL and starts nothing", () => {
    const box = makeBox([`KRAKEN_APP_URL=""`]);
    makeCurrent(box);
    const r = box.run("start.sh");
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("KRAKEN_APP_URL must be https");
    expect(box.lines()).toEqual([]);
  });

  it("accepts http://localhost:3100", () => {
    const box = makeBox([`KRAKEN_APP_URL="http://localhost:3100"`]);
    makeCurrent(box);
    expect(box.run("start.sh").status).toBe(0);
    expect(box.lines()).toHaveLength(1);
  });

  it("accepts http://127.0.0.1 and refuses a host that only starts with localhost", () => {
    const ok = makeBox([`KRAKEN_APP_URL="http://127.0.0.1:3100/x"`]);
    makeCurrent(ok);
    expect(ok.run("start.sh").status).toBe(0);

    const bad = makeBox([`KRAKEN_APP_URL="http://localhost.example"`]);
    makeCurrent(bad);
    expect(bad.run("start.sh").status).not.toBe(0);
    expect(bad.lines()).toEqual([]);
  });
});

describe("deploy.sh", () => {
  it("runs npm ci --include=dev, build, db:migrate in that order, points current at the new sha, then kickstarts KRAKEN_SERVICE", () => {
    const box = makeDeployBox();
    const r = box.run("deploy.sh");
    expect(r.status).toBe(0);
    expect(box.lines()).toEqual([
      "npm ci --include=dev",
      "npm run build",
      "npm run db:migrate",
      `launchctl kickstart -k ${SERVICE}`,
    ]);
    expect(box.current()).toBe(box.rel(box.first));
    // current already pointed at the new release when the service was kicked.
    expect(box.side("kick")).toEqual([box.rel(box.first)]);
    // npm ran inside the release's final path, and the tree was exported there.
    expect(new Set(box.side("cwd"))).toEqual(new Set([box.rel(box.first)]));
    expect(readFileSync(path.join(box.rel(box.first), "file.txt"), "utf8")).toBe("version 1\n");
    expect(box.releases()).toEqual([box.first]);
    expect(existsSync(path.join(box.home, "current.tmp"))).toBe(false);
  });

  it("on a failed build: exits non-zero, current unchanged, release dir removed, no migrate, no kickstart", () => {
    const box = makeDeployBox();
    expect(box.run("deploy.sh").status).toBe(0);
    const second = box.commit();
    writeFileSync(box.log, "");

    const r = box.run("deploy.sh", { STUB_FAIL: "npm run build" });
    expect(r.status).not.toBe(0);
    expect(box.current()).toBe(box.rel(box.first));
    expect(existsSync(box.rel(second))).toBe(false);
    expect(box.releases()).toEqual([box.first]);
    expect(box.lines()).toEqual(["npm ci --include=dev", "npm run build"]);
  });

  it("on a failed migration: exits non-zero, current unchanged, no kickstart", () => {
    const box = makeDeployBox();
    expect(box.run("deploy.sh").status).toBe(0);
    const second = box.commit();
    writeFileSync(box.log, "");

    const r = box.run("deploy.sh", { STUB_FAIL: "npm run db:migrate" });
    expect(r.status).not.toBe(0);
    expect(box.current()).toBe(box.rel(box.first));
    expect(existsSync(box.rel(second))).toBe(false);
    expect(box.lines()).toEqual(["npm ci --include=dev", "npm run build", "npm run db:migrate"]);
    expect(box.lines().some((l) => l.startsWith("launchctl"))).toBe(false);
  });

  it("on a first deploy that fails: exits non-zero and leaves no current and no release", () => {
    const box = makeDeployBox();
    const r = box.run("deploy.sh", { STUB_FAIL: "npm ci --include=dev" });
    expect(r.status).not.toBe(0);
    expect(box.current()).toBeNull();
    expect(box.releases()).toEqual([]);
  });

  it("exits 0 and runs nothing when current is already origin/main", () => {
    const box = makeDeployBox();
    expect(box.run("deploy.sh").status).toBe(0);
    writeFileSync(box.log, "");

    const r = box.run("deploy.sh");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Already deployed");
    expect(box.lines()).toEqual([]);
    expect(box.current()).toBe(box.rel(box.first));
  });

  it("redeploying the same sha with a trailing-slash KRAKEN_HOME exits 0, runs nothing, and leaves the live release intact", () => {
    const box = makeDeployBox();
    expect(box.run("deploy.sh").status).toBe(0);
    writeFileSync(box.log, "");

    const r = box.run("deploy.sh", { KRAKEN_HOME: `${box.home}/` });
    expect(r.status).toBe(0);
    expect(box.lines()).toEqual([]);
    expect(readFileSync(path.join(box.rel(box.first), "file.txt"), "utf8")).toBe("version 1\n");
    expect(box.current()).toBe(box.rel(box.first));
  });

  it("redeploying the same sha when current is a relative link exits 0, runs nothing, and leaves the live release intact", () => {
    const box = makeDeployBox();
    expect(box.run("deploy.sh").status).toBe(0);
    rmSync(path.join(box.home, "current"));
    symlinkSync(`releases/${box.first}`, path.join(box.home, "current"));
    writeFileSync(box.log, "");

    const r = box.run("deploy.sh");
    expect(r.status).toBe(0);
    expect(box.lines()).toEqual([]);
    expect(readFileSync(path.join(box.rel(box.first), "file.txt"), "utf8")).toBe("version 1\n");
  });

  it("keeps the previous release after a second deploy with a trailing-slash KRAKEN_HOME", () => {
    const box = makeDeployBox();
    expect(box.run("deploy.sh").status).toBe(0);
    const second = box.commit();
    expect(box.run("deploy.sh", { KRAKEN_HOME: `${box.home}/` }).status).toBe(0);
    expect(box.releases()).toEqual([box.first, second].sort());
    expect(readFileSync(path.join(box.rel(box.first), "file.txt"), "utf8")).toBe("version 1\n");
  });

  it("refuses to rebuild the directory current resolves to when it is spelled differently, and changes nothing", () => {
    const box = makeDeployBox();
    expect(box.run("deploy.sh").status).toBe(0);
    // current -> alias -> releases/<sha>: the link text does not name the sha.
    const alias = path.join(box.home, "live-alias");
    symlinkSync(box.rel(box.first), alias);
    rmSync(path.join(box.home, "current"));
    symlinkSync(alias, path.join(box.home, "current"));
    writeFileSync(box.log, "");

    const r = box.run("deploy.sh");
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("live release");
    expect(box.lines()).toEqual([]);
    expect(readFileSync(path.join(box.rel(box.first), "file.txt"), "utf8")).toBe("version 1\n");
  });

  it("kickstart fails: stderr names the sha and the kickstart command, current points at the new release, old releases are pruned to two, exit non-zero", () => {
    const box = makeDeployBox();
    expect(box.run("deploy.sh").status).toBe(0);
    const second = box.commit();
    expect(box.run("deploy.sh").status).toBe(0);
    const third = box.commit();

    const r = box.run("deploy.sh", { STUB_FAIL: "launchctl" });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain(third);
    expect(r.stderr).toContain(`launchctl kickstart -k "${SERVICE}"`);
    expect(r.stderr).toContain("NOT restarted");
    expect(r.stderr).not.toContain("secret");
    expect(r.stdout).not.toContain("Deployed");
    expect(box.current()).toBe(box.rel(third));
    expect(box.releases()).toEqual([second, third].sort());
  });

  it("rebuilds when current is a dangling link named after origin/main instead of claiming it is deployed", () => {
    const box = makeDeployBox();
    expect(box.run("deploy.sh").status).toBe(0);
    rmSync(box.rel(box.first), { recursive: true, force: true });
    writeFileSync(box.log, "");

    const r = box.run("deploy.sh");
    expect(r.status).toBe(0);
    expect(r.stdout).not.toContain("Already deployed");
    expect(box.lines()).toEqual([
      "npm ci --include=dev",
      "npm run build",
      "npm run db:migrate",
      `launchctl kickstart -k ${SERVICE}`,
    ]);
    expect(box.current()).toBe(box.rel(box.first));
    expect(readFileSync(path.join(box.rel(box.first), "file.txt"), "utf8")).toBe("version 1\n");
  });

  it("after a third deploy keeps exactly two releases, one of them current", () => {
    const box = makeDeployBox();
    expect(box.run("deploy.sh").status).toBe(0);
    const second = box.commit();
    expect(box.run("deploy.sh").status).toBe(0);
    const third = box.commit();
    expect(box.run("deploy.sh").status).toBe(0);

    expect(box.releases()).toEqual([second, third].sort());
    expect(box.current()).toBe(box.rel(third));
  });
});

describe("backup.sh", () => {
  const dumps = (box: Box) => readdirSync(box.backups).sort();

  it("writes kraken-<stamp>.dump with mode 600 and no .partial left behind", () => {
    const box = makeBox();
    const r = box.run("backup.sh");
    expect(r.status).toBe(0);
    const files = dumps(box);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^kraken-\d{8}-\d{6}\.dump$/);
    expect(statSync(path.join(box.backups, files[0]!)).mode & 0o777).toBe(0o600);
    expect(readFileSync(path.join(box.backups, files[0]!), "utf8")).toBe("dump\n");
    const [call] = box.lines();
    expect(call).toContain("pg_dump --format=custom --no-owner --no-privileges");
  });

  it("on pg_dump failure: exits non-zero, leaves no .dump or .partial from this run, prunes nothing", () => {
    const box = makeBox();
    const old: string[] = [];
    for (let i = 1; i <= 16; i++) {
      const name = `kraken-20200101-0000${String(i).padStart(2, "0")}.dump`;
      old.push(name);
      writeFileSync(path.join(box.backups, name), "old");
    }
    const r = box.run("backup.sh", { STUB_FAIL: "pg_dump" });
    expect(r.status).not.toBe(0);
    expect(dumps(box)).toEqual(old);
  });

  it("when killed with SIGTERM mid-dump: exits non-zero and leaves no .partial or .dump", () => {
    const box = makeBox();
    const r = box.run("backup.sh", { STUB_KILL_PARENT: "1" });
    expect(r.status).not.toBe(0);
    expect(box.lines()[0]).toContain("pg_dump");
    expect(dumps(box)).toEqual([]);
  });

  it("keeps the 14 newest of 16 dumps", () => {
    const box = makeBox();
    const old: string[] = [];
    for (let i = 1; i <= 16; i++) {
      const name = `kraken-20200101-0000${String(i).padStart(2, "0")}.dump`;
      old.push(name);
      writeFileSync(path.join(box.backups, name), "old");
    }
    expect(box.run("backup.sh").status).toBe(0);
    const files = dumps(box);
    expect(files).toHaveLength(14);
    // The new dump (stamped now) is the newest; the 13 newest old ones remain.
    expect(files.slice(0, 13)).toEqual(old.slice(3));
    expect(files[13]).toMatch(/^kraken-20\d{6}-\d{6}\.dump$/);
    expect(files[13]).not.toBe(old[15]);
  });
});
