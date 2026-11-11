# Sourced by the self-hosted scripts, never executed. Needs KRAKEN_HOME and
# $KRAKEN_HOME/kraken.env; loads the latter with every variable exported.

if [ -z "${KRAKEN_HOME:-}" ]; then
  echo "KRAKEN_HOME is not set" >&2
  exit 1
fi
if [ ! -f "$KRAKEN_HOME/kraken.env" ]; then
  echo "missing $KRAKEN_HOME/kraken.env" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. "$KRAKEN_HOME/kraken.env"
set +a
