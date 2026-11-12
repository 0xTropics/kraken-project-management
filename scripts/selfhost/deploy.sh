#!/usr/bin/env bash
# Ships origin/main: export, build and migrate in a new release, then switch.
set -euo pipefail

# shellcheck source=lib.sh
. "$(dirname "$0")/lib.sh"

: "${KRAKEN_SERVICE:?KRAKEN_SERVICE is not set in kraken.env}"

repo="$KRAKEN_HOME/repo"
releases="$KRAKEN_HOME/releases"
current="$KRAKEN_HOME/current"

git -C "$repo" fetch origin main
sha=$(git -C "$repo" rev-parse origin/main)
if [ -z "$sha" ]; then
  echo "deploy failed: origin/main did not resolve to a commit; nothing changed" >&2
  exit 1
fi
rel="$releases/$sha"

# Releases are identified by sha (the directory name), never by comparing path
# strings: KRAKEN_HOME may be spelled differently from how the link was made.
prev_sha=""
if [ -L "$current" ]; then
  prev_sha=$(basename "$(readlink "$current")")
fi
# Only when current resolves to a directory: a dangling link is rebuilt.
if [ "$prev_sha" = "$sha" ] && [ -d "$current" ]; then
  echo "Already deployed $sha"
  exit 0
fi

# Where current physically resolves; nothing that is the same place gets deleted.
live=""
if [ -d "$current" ]; then
  live=$(cd -P "$current" && pwd -P)
fi
is_live() {
  [ -n "$live" ] && [ -d "$1" ] && [ "$(cd -P "$1" && pwd -P)" = "$live" ]
}

# Builds record absolute paths, so the release is built where it will live.
fail() {
  echo "deploy failed: $1; $sha removed, current unchanged" >&2
  if ! is_live "$rel"; then
    rm -rf "$rel"
  fi
  exit 1
}

if is_live "$rel"; then
  echo "refusing to rebuild $sha: it is the live release (current resolves to it)" >&2
  exit 1
fi
rm -rf "$rel"
mkdir -p "$rel"
if ! { git -C "$repo" archive "$sha" | tar -x -f - -C "$rel"; }; then
  fail "export"
fi
for step in "npm ci --include=dev" "npm run build" "npm run db:migrate"; do
  # shellcheck disable=SC2086
  if ! (cd "$rel" && $step); then
    fail "$step"
  fi
done

ln -sfn "$rel" "$KRAKEN_HOME/current.tmp"
# -h (BSD) and -T (GNU) both make mv replace the symlink instead of entering it.
if [ "$(uname)" = "Darwin" ]; then
  mv -fh "$KRAKEN_HOME/current.tmp" "$current"
else
  mv -fT "$KRAKEN_HOME/current.tmp" "$current"
fi

# A failed restart is reported, not fatal yet: current has already moved and the
# migrations are applied, so the old releases are still pruned before exiting.
restarted=1
if ! launchctl kickstart -k "$KRAKEN_SERVICE"; then
  restarted=0
  echo "deploy incomplete: current now points at $sha and its migrations are applied, but the app was NOT restarted. Restart it with: launchctl kickstart -k \"$KRAKEN_SERVICE\"" >&2
fi

for dir in "$releases"/*; do
  [ -d "$dir" ] || continue
  name=$(basename "$dir")
  if [ "$name" != "$sha" ] && [ "$name" != "$prev_sha" ] && ! is_live "$dir"; then
    rm -rf "$dir"
  fi
done
if [ "$restarted" -ne 1 ]; then
  exit 1
fi
echo "Deployed $sha"
