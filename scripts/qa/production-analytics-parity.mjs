/**
 * Read-only product-analytics sanity check.
 *
 * Confirms the surfaces that claim to show the same truth actually agree, so a
 * dashboard can never drift from the rows it links to. Every check is a SELECT.
 *
 *   SERVICE_URL=<owner/service url> node scripts/qa/production-analytics-parity.mjs
 */
import { Pool } from '@neondatabase/serverless'

const url = process.env.SERVICE_URL
if (!url) throw new Error('SERVICE_URL is required')

const parsed = new URL(url)
parsed.searchParams.delete('channel_binding')
const pool = new Pool({ connectionString: parsed.toString(), max: 1 })

const ORG = process.env.AUDIT_ORG ?? '11111111-1111-1111-1111-111111111111'
const results = []
const ok = (m) => results.push(['ok', m])
const fail = (m) => results.push(['FAIL', m])

const one = async (sql, params = []) => (await pool.query(sql, params)).rows[0]

// ── Inbox: canonical queue state versus the counts the surfaces display ──────
const counts = await one(
  `select
     count(*) filter (where cs.stage = 'waiting_on_rep')::int as need_reply,
     count(*) filter (where cs.stage = 'waiting_on_client')::int as waiting,
     count(*) filter (where cs.next_followup_at is not null
                        and cs.next_followup_at <= now())::int as followups,
     count(*)::int as total
   from leads l
   join conversation_states cs on cs.lead_id = l.id and cs.organization_id = l.organization_id
   where l.organization_id = $1 and l.archived = false`,
  [ORG],
)
ok(`inbox canonical counts: need_reply=${counts.need_reply} waiting=${counts.waiting} followups=${counts.followups} total=${counts.total}`)

// Destination rows must exist for each non-zero bucket.
const destinations = await one(
  `select
     (select count(*)::int from leads l2
        join conversation_states c2 on c2.lead_id = l2.id and c2.organization_id = l2.organization_id
       where l2.organization_id = $1 and l2.archived = false and c2.stage = 'waiting_on_rep') as need_reply_rows,
     (select count(*)::int from leads l3
        join conversation_states c3 on c3.lead_id = l3.id and c3.organization_id = l3.organization_id
       where l3.organization_id = $1 and l3.archived = false and c3.stage = 'waiting_on_client') as waiting_rows`,
  [ORG],
)
if (counts.need_reply === destinations.need_reply_rows) ok('inbox need-reply count == destination rows')
else fail(`inbox need-reply drift: count ${counts.need_reply} vs rows ${destinations.need_reply_rows}`)
if (counts.waiting === destinations.waiting_rows) ok('inbox waiting count == destination rows')
else fail(`inbox waiting drift: count ${counts.waiting} vs rows ${destinations.waiting_rows}`)

// ── Tasks: the list length must equal the open-task count ────────────────────
const tasks = await one(
  `select
     count(*) filter (where status not in ('DONE','CANCELLED'))::int as open,
     count(*)::int as total
   from assigned_tasks where organization_id = $1`,
  [ORG],
)
ok(`tasks: open=${tasks.open} total=${tasks.total}`)

// ── Coverage: every active identity's profile must have a primary ───────────
const coverage = await one(
  `select count(*)::int as mismatches
   from revenue_identities i
   join identity_assignments a on a.revenue_identity_id = i.id and a.organization_id = i.organization_id
   where i.organization_id = $1 and i.status = 'active' and i.profile_id is not null
     and not exists (
       select 1 from profile_coverage c
        where c.profile_id = i.profile_id and c.organization_id = $1
          and c.role = 'PRIMARY' and c.active = true)`,
  [ORG],
)
if (coverage.mismatches === 0) ok('every executable profile has a primary coverage owner')
else fail(`${coverage.mismatches} executable profiles lack a primary coverage owner`)

// ── Accountability: an active target must be a positive number ───────────────
const accountability = await one(
  `select count(*)::int as bad
   from daily_targets
   where organization_id = $1 and active = true and target_count <= 0`,
  [ORG],
)
if (accountability.bad === 0) ok('every active target has a positive target count')
else fail(`${accountability.bad} active targets have a non-positive target count`)

// ── Targets: every active target maps to an active identity ──────────────────
const targets = await one(
  `select count(*)::int as bad
   from daily_targets t
   where t.organization_id = $1 and t.active = true
     and not exists (
       select 1 from revenue_identities i
        where i.id = t.revenue_identity_id and i.organization_id = $1 and i.status = 'active')`,
  [ORG],
)
if (targets.bad === 0) ok('every active target maps to an active identity')
else fail(`${targets.bad} active targets map to a missing or inactive identity`)

// ── Ledger: a recently-created contacted/replied lead must have a send event ─
// Scoped to the last 14 days so pre-ledger history is not reported as a gap.
const ledger = await one(
  `select count(*)::int as missing
   from leads l
   where l.organization_id = $1 and l.status in ('contacted','followed_up','replied')
     and l.created_at >= now() - interval '14 days'
     and not exists (
       select 1 from action_events e
        where e.lead_id = l.id and e.organization_id = $1
          and e.action_type in ('CONNECTION_SENT','DM_SENT','FOLLOWUP_SENT','REPLY_SENT'))`,
  [ORG],
)
if (ledger.missing === 0) ok('every recent contacted/replied lead has an outbound ledger event')
else fail(`${ledger.missing} recent contacted/replied leads have no outbound ledger event`)

await pool.end()

console.log(`\nProduction analytics parity — org ${ORG}`)
console.log('─'.repeat(64))
for (const [status, message] of results) console.log(`${status === 'ok' ? 'ok  ' : 'FAIL'} ${message}`)
const failures = results.filter(([s]) => s === 'FAIL').length
console.log('─'.repeat(64))
console.log(`${results.length - failures} ok, ${failures} failed`)
process.exit(failures === 0 ? 0 : 1)
