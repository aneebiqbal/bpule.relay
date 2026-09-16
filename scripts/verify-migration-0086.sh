#!/bin/bash
# Verify migration 0086 was applied to remote Supabase

SUPA_URL="https://fhnkanwvgamitrcuzpem.supabase.co"
SUPA_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZobmthbnd2Z2FtaXRyY3V6cGVtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTA3MTczMCwiZXhwIjoyMTA0NjQ3NzMwfQ.ekQzE_nc8bm2xdug8txlVkPcDWCdC_uOA9BEhQGn1Gg"

echo "=== relay_events ==="
curl -s "${SUPA_URL}/rest/v1/relay_events?limit=0" \
  -H "apikey: <_REDACTED> \
  -H "Authorization: Bearer ${SUPA_KEY}"
echo ""

echo "=== relay_runs ==="
curl -s "${SUPA_URL}/rest/v1/relay_runs?limit=0" \
  -H "apikey: <_REDACTED> \
  -H "Authorization: Bearer ${SUPA_KEY}"
echo ""

echo "=== Check indexes on relay_events ==="
curl -s "${SUPA_URL}/rest/v1/rpc/exec_sql" \
  -H "apikey: <_REDACTED> \
  -H "Authorization: Bearer ${SUPA_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT indexname FROM pg_indexes WHERE tablename = '\''relay_events'\'' ORDER BY indexname;"}'
echo ""
