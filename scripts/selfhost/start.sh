#!/usr/bin/env bash
# Runs the live release. The service manager runs this and keeps it up.
set -euo pipefail

# shellcheck source=lib.sh
. "$(dirname "$0")/lib.sh"

export NODE_ENV=production
export TZ=UTC

case "${KRAKEN_APP_URL:-}" in
  https://*) ;;
  http://localhost | http://localhost:* | http://localhost/*) ;;
  http://127.0.0.1 | http://127.0.0.1:* | http://127.0.0.1/*) ;;
  *)
    echo "KRAKEN_APP_URL must be https: the session cookie is not sent over plain http" >&2
    exit 1
    ;;
esac

cd -P "$KRAKEN_HOME/current"
exec node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port "${PORT:-3100}"
