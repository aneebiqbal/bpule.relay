#!/usr/bin/env bash
# ============================================================================
# Bounded connection-safety test (section 29).
#
# Hits core pages with 5 and 10 concurrent clients against the local Relay
# instance (configured for Aiven), measuring latency/errors and watching for
# connection-limit failures.
#
# Usage:  RELAY_BASE_URL=http://localhost:3003 COOKIE_JAR=/tmp/cookies.txt \
#           bash supabase/aiven/load-test.sh
# ============================================================================
set -uo pipefail

BASE="${RELAY_BASE_URL:-http://localhost:3003}"
JAR="${COOKIE_JAR:-/tmp/relay-cookies.txt}"
PAGES="${PAGES:-/dashboard /chats /leads /tasks /team /prospect}"
CONCURRENCY="${1:-5}"

if [ ! -f "$JAR" ]; then
  echo "cookie jar $JAR not found; sign in first" >&2
  exit 1
fi

echo "== $CONCURRENCY concurrent clients x $(echo $PAGES | wc -w) pages =="
tmp="$(mktemp -d)"
for round in $(seq 1 "$CONCURRENCY"); do
  for page in $PAGES; do
    (
      out=$(curl -s -b "$JAR" --max-time 60 -o /dev/null -w "%{http_code} %{time_total}" "$BASE$page")
      echo "$page $out" >> "$tmp/results"
    ) &
  done
done
wait

echo "-- results --"
sort "$tmp/results" | awk '{printf "%-14s %s %ss\n", $1, $2, $3}'
echo "-- summary --"
awk '{if ($2 !~ /^2|^3/) err++; total++; if ($3 > max) max=$3} END {printf "requests=%d errors=%d max_latency=%.2fs\n", total, err+0, max}' "$tmp/results"
rm -rf "$tmp"
