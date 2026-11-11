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
rel="$releases/$sha"

previous=""
if [ -L "$current" ]; then
  previous=$(readlink "$current")
fi
if [ "$previous" = "$rel" ]; then
  echo "Already deployed $sha"
  exit 0
fi

# Builds record absolute paths, so the release is built where it will live.
fail() {
  echo "deploy failed: $1; $sha removed, current unchanged" >&2
  rm -rf "$rel"
  exit 1
}

rm -rf "$rel"
mkdir -p "$rel"
if ! { git -C "$repo" archive "$sha" | tar -x -C "$rel"; }; then
  fail "export"
fi
for step in "npm ci" "npm run build" "npm run db:migrate"; do
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

launchctl kickstart -k "$KRAKEN_SERVICE"

for dir in "$releases"/*; do
  [ -d "$dir" ] || continue
  if [ "$dir" != "$rel" ] && [ "$dir" != "$previous" ]; then
    rm -rf "$dir"
  fi
done
echo "Deployed $sha"
