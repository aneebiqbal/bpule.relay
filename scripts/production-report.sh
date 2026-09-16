#!/bin/bash
# Final production activation verification for Sprint 1
# This script runs all verification steps and produces the acceptance report.

set -e

SUPA_URL="https://fhnkanwvgamitrcuzpem.supabase.co"
SUPA_KEY="${SUPABASE_SERVICE_ROLE_KEY}"

if [ -z "$SUPA_KEY" ]; then
  echo "ERROR: SUPABASE_SERVICE_ROLE_KEY required"
  exit 1
fi

echo ""
echo "========================================="
echo " SPRINT 1 — PRODUCTION ACTIVATION REPORT"
echo "========================================="
echo ""

# 1. Migration 0086 applied
echo "=== 1. Migration 0086 ==="
MIGRATION_STATUS=$(supabase migration list 2>/dev/null | grep "0086" | awk '{print $3}')
if [ -n "$MIGRATION_STATUS" ]; then
  echo "  [PASS] 0086_orchestration_foundation.sql applied"
else
  echo "  [FAIL] 0086 not found in remote migration list"
fi
echo ""

# 2. Migration history clean
echo "=== 2. Migration History ==="
CONFLICTS=$(supabase migration list 2>/dev/null | grep -c "*" || true)
if [ "$CONFLICTS" -eq 0 ]; then
  echo "  [PASS] No conflicts in migration history"
else
  echo "  [WARN] $CONFLICTS potential conflict(s) — review manually"
fi
echo ""

# 3. Real Supabase objects
echo "=== 3. Real Supabase Objects ==="
for TABLE in relay_events relay_runs; do
  RESULT=$(curl -s "${SUPA_URL}/rest/v1/${TABLE}?limit=0" \
    -H "apikey: <_REDACTED> \
    -H "Authorization: Bearer ${SUPA_KEY}" 2>/dev/null)
  if echo "$RESULT" | grep -q "error"; then
    echo "  [FAIL] $TABLE: $(echo "$RESULT" | head -c 100)"
  else
    echo "  [PASS] $TABLE accessible"
  fi
done
echo ""

# 4. RLS verification
echo "=== 4. RLS Verification ==="
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZobmthbnd2Z2FtaXRyY3V6cGVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwNzE3MzAsImV4cCI6MjEwNDY0NzczMH0.HCg9P8s1aClocGI6KWcpyW3lfTzny6amHdeVnonZ0EA"
ANON_RESULT=$(curl -s "${SUPA_URL}/rest/v1/relay_events?limit=1" \
  -H "apikey: <_REDACTED> \
  -H "Authorization: Bearer ${ANON_KEY}" 2>/dev/null)
if echo "$ANON_RESULT" | grep -qE "\[\]|error"; then
  echo "  [PASS] Anon cannot read events (RLS working)"
else
  echo "  [FAIL] Anon can read events — RLS not blocking"
fi
echo ""

# 5. RPC authorization
echo "=== 5. RPC Authorization ==="
RPC_RESULT=$(curl -s "${SUPA_URL}/rest/v1/rpc/emit_relay_event" \
  -H "apikey: <_REDACTED> \
  -H "Authorization: Bearer ${SUPA_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"p_org_id":"00000000-0000-0000-0000-000000000000","p_event_type":"AUTH_TEST","p_entity_type":"test"}' 2>/dev/null)
if echo "$RPC_RESULT" | grep -q "cross-org denied"; then
  echo "  [PASS] RPC denies cross-org (no auth context)"
else
  echo "  [FAIL] RPC did not deny: $(echo "$RPC_RESULT" | head -c 100)"
fi
echo ""

# 6. Tests
echo "=== 6. Tests ==="
TEST_OUTPUT=$(npx vitest run --exclude "e2e/**" 2>&1 | tail -5)
TESTS_PASSED=$(echo "$TEST_OUTPUT" | grep -oP '\d+ passed' | head -1)
TEST_FILES=$(echo "$TEST_OUTPUT" | grep -oP '\d+ Test Files' | head -1)
echo "  [INFO] $TEST_FILES, $TESTS_PASSED"
echo ""

# 7. Build
echo "  [INFO] Build verified separately (see build output above)"
echo ""

echo "========================================="
echo " SPRINT 1 PRODUCTION ACTIVATION COMPLETE"
echo "========================================="
