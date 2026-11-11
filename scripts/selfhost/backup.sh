#!/usr/bin/env bash
# Dumps the database to KRAKEN_BACKUP_DIR and keeps the 14 newest dumps.
set -euo pipefail

# shellcheck source=lib.sh
. "$(dirname "$0")/lib.sh"

umask 077

: "${KRAKEN_BACKUP_DIR:?KRAKEN_BACKUP_DIR is not set in kraken.env}"
: "${DATABASE_URL:?DATABASE_URL is not set in kraken.env}"
if [ -n "${PG_BIN_DIR:-}" ]; then
  PATH="$PG_BIN_DIR:$PATH"
fi

mkdir -p "$KRAKEN_BACKUP_DIR"
stamp=$(date -u +%Y%m%d-%H%M%S)
final="$KRAKEN_BACKUP_DIR/kraken-$stamp.dump"
partial="$final.partial"

if ! pg_dump --format=custom --no-owner --no-privileges --file="$partial" --dbname="$DATABASE_URL"; then
  rm -f "$partial"
  echo "backup failed: pg_dump exited non-zero; nothing pruned" >&2
  exit 1
fi
mv -f "$partial" "$final"

ls -1 "$KRAKEN_BACKUP_DIR" | grep '^kraken-.*\.dump$' | sort -r | awk 'NR > 14' |
  while IFS= read -r name; do
    rm -f "$KRAKEN_BACKUP_DIR/$name"
  done
echo "Wrote $final"
