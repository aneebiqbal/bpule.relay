import { Pool } from '@neondatabase/serverless'

const parsed = new URL(process.env.RELAY_APP_URL)
parsed.searchParams.delete('channel_binding')
const pool = new Pool({ connectionString: parsed.toString() })

const AUTH_USER = '02b2d1bc-346c-469c-86cd-a200e6b74a43'
const ORG = '11111111-1111-1111-1111-111111111111'
const IDS = ['45e84a2e-6eda-4f03-b358-788057a55c98', '9a21b0a2-b9e7-41d4-a3ab-1b2728aaa3ae', 'c175fb81-418b-4e3f-9f28-4bb758cadd9a', 'f9809535-c4ec-4b4f-b000-b98f44bdb623', 'd40853c6-1393-4bf0-bf69-9b6f42f9122f']

try {
  const who = await pool.query('select current_user')
  console.log('current_user:', who.rows[0].current_user)

  const eq = await pool.query("SELECT q.* FROM (SELECT set_config('app.current_user_id', $1, true) AS _g) AS ctx CROSS JOIN LATERAL (SELECT lead_id FROM conversation_states WHERE organization_id = $2 LIMIT 5) q", [AUTH_USER, ORG])
  console.log('lateral local eq only:', eq.rows.length)

  const eqIn = await pool.query("SELECT q.* FROM (SELECT set_config('app.current_user_id', $1, true) AS _g) AS ctx CROSS JOIN LATERAL (SELECT lead_id FROM conversation_states WHERE organization_id = $2 AND lead_id IN ($3, $4, $5, $6, $7)) q", [AUTH_USER, ORG, ...IDS])
  console.log('lateral local eq+in:', eqIn.rows.length)

  const all = await pool.query("SELECT q.* FROM (SELECT set_config('app.current_user_id', $1, true) AS _g) AS ctx CROSS JOIN LATERAL (SELECT count(*)::int AS n FROM conversation_states) q", [AUTH_USER])
  console.log('lateral local all states:', all.rows[0]?.n)

  const inOnly = await pool.query("SELECT q.* FROM (SELECT set_config('app.current_user_id', $1, true) AS _g) AS ctx CROSS JOIN LATERAL (SELECT lead_id FROM conversation_states WHERE lead_id IN ($2, $3, $4, $5, $6)) q", [AUTH_USER, ...IDS])
  console.log('lateral local in only:', inOnly.rows.length)

  await pool.query('SELECT set_config(\'app.current_user_id\', $1, false)', [AUTH_USER])
  const sessionEqIn = await pool.query('SELECT lead_id FROM conversation_states WHERE organization_id = $1 AND lead_id IN ($2, $3, $4, $5, $6)', [ORG, ...IDS])
  console.log('session eq+in:', sessionEqIn.rows.length)

  const anyArr = await pool.query("SELECT q.* FROM (SELECT set_config('app.current_user_id', $1, true) AS _g) AS ctx CROSS JOIN LATERAL (SELECT lead_id FROM conversation_states WHERE organization_id = $2 AND lead_id = ANY($3::uuid[])) q", [AUTH_USER, ORG, IDS])
  console.log('lateral local eq+any:', anyArr.rows.length)

  const single = await pool.query("SELECT q.* FROM (SELECT set_config('app.current_user_id', $1, true) AS _g) AS ctx CROSS JOIN LATERAL (SELECT lead_id FROM conversation_states WHERE organization_id = $2 AND lead_id IN ($3)) q", [AUTH_USER, ORG, IDS[0]])
  console.log('lateral local eq+in single:', single.rows.length)

  const sessionLat = await pool.query("SELECT q.* FROM (SELECT set_config('app.current_user_id', $1, false) AS _g) AS ctx CROSS JOIN LATERAL (SELECT lead_id FROM conversation_states WHERE organization_id = $2 AND lead_id IN ($3, $4, $5, $6, $7)) q", [AUTH_USER, ORG, ...IDS])
  console.log('lateral session eq+in:', sessionLat.rows.length)
} finally {
  await pool.end()
}
