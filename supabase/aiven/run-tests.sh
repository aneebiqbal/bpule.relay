#!/usr/bin/env bash
# Run the Relay suite against the Aiven certification database.
# Auth stays on Neon; only the database provider changes.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

set -a
# shellcheck disable=SC1091
source .env.local
set +a

export RELAY_DB_PROVIDER=postgres
export DATABASE_URL="$AIVEN_RELAY_APP_URL"
export SERVICE_DATABASE_URL="$AIVEN_RELAY_SERVICE_URL"
export DATABASE_POOL_MAX="${DATABASE_POOL_MAX:-3}"
export SERVICE_DATABASE_POOL_MAX="${SERVICE_DATABASE_POOL_MAX:-1}"

exec npm test "$@"
