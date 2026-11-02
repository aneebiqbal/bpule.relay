#!/bin/zsh
# Local, synthetic, production-shaped Relay stack for browser certification.
# docs/RELAY_PHASE8_SYNTHETIC_CERTIFICATION.md explains every step.
#
#   scripts/synthetic-stack/setup.sh <work_dir> <prod_schema.sql>
#
# <prod_schema.sql> is a SCHEMA-ONLY dump (`supabase db dump --linked`): no rows,
# no personal data. Everything seeded is fictional. Ports 55420-55429, project
# id relay-p8-synth: it never touches another local stack or any remote project.
set -eu
W=${1:?work dir}; DUMP=${2:?schema-only dump}; R=$(cd "$(dirname "$0")/../.." && pwd)
C=supabase_db_relay-p8-synth
mkdir -p "$W/stack" && cd "$W/stack"
[[ -f supabase/config.toml ]] || supabase init >/dev/null
python3 - supabase/config.toml <<'PY'
import re, sys
p = sys.argv[1]; s = open(p).read()
s = re.sub(r'project_id = "[^"]*"', 'project_id = "relay-p8-synth"', s, count=1)
for a, b in [('54321', '55421'), ('54322', '55422'), ('54320', '55420'), ('54329', '55429'), ('54323', '55423'), ('54324', '55424'), ('54327', '55427')]:
    s = s.replace('port = ' + a, 'port = ' + b)
s = s.replace('http://127.0.0.1:3000', 'http://127.0.0.1:3200')
for sec in ['realtime', 'studio', 'inbucket', 'storage', 'edge_runtime', 'analytics', 'db.seed']:
    s = re.sub(r'(\[' + re.escape(sec) + r'\]\n(?:#.*\n)*enabled = )true', r'\1false', s)
open(p, 'w').write(s)
PY
supabase start >/dev/null
supabase status -o env 2>/dev/null | grep -E '^[A-Z_]+=' > .env.synth
p() { docker exec -i -e PGPASSWORD=postgres $C psql -U supabase_admin -h 127.0.0.1 -d postgres -X "$@"; }
p -q -f - < "$DUMP" > load.log 2>&1
for m in 20261023000000_scope_lead_company_uniqueness 20261029120001_upwork_sender_attribution 20261031120000_assigned_tasks \
         20261101120000_operations_workspace 20261101130000_meeting_booked_event 20261101135000_notifications_canonical_shape \
         20261101140000_notification_dedupe 20261101150000_pin_security_definer_search_path 20261101151000_lead_message_previews \
         20261101160000_close_anon_exposure; do
  if [[ $m == 20261023000000_* ]]; then fl=(-v ON_ERROR_STOP=1); else fl=(-1 -v ON_ERROR_STOP=1); fi
  p -q "${fl[@]}" -f - < "$R/supabase/migrations/$m.sql" > "m_$m.log" 2>&1 && echo "ok   $m" || { echo "FAIL $m"; exit 1; }
done
p -qc "notify pgrst, 'reload schema'"
python3 -I "$R/scripts/synthetic-stack/seed.py" "$W/stack"
echo "Stack ready. Credentials: $W/stack/.env.synth (local only), password file $W/stack/.synth_password."
