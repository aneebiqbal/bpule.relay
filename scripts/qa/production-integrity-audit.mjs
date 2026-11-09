/**
 * Read-only production data-integrity audit.
 *
 * Every check is a SELECT. Nothing is mutated. Run it from a machine holding
 * the service URL; credentials are never printed.
 *
 *   SERVICE_URL=<owner/service url> node scripts/qa/production-integrity-audit.mjs
 */
import { Pool } from '@neondatabase/serverless'

const url = process.env.SERVICE_URL
if (!url) throw new Error('SERVICE_URL is required')

const parsed = new URL(url)
parsed.searchParams.delete('channel_binding')
const pool = new Pool({ connectionString: parsed.toString(), max: 1 })

const ORG = process.env.AUDIT_ORG ?? '11111111-1111-1111-1111-111111111111'
const findings = []
const ok = (m) => findings.push(['ok', m])
const warn = (m) => findings.push(['WARN', m])

const run = async (name, sql, params = []) => {
  try {
    return (await pool.query(sql, params)).rows
  } catch (err) {
    warn(`${name}: query failed — ${err.message}`)
    return []
  }
}

// 1. Duplicate active identities for the same person/channel.
const dupIdentities = await run(
  'duplicate active identities',
  `select profile_id, channel, count(*)::int as n
     from revenue_identities
    where organization_id = $1 and status = 'active'
    group by profile_id, channel
   having count(*) > 1
    order by n desc limit 20`,
  [ORG],
)
if (dupIdentities.length === 0) ok('no duplicate active person/channel identities')
else warn(`${dupIdentities.length} duplicated active identity rows`)

// 2. Active identities with no rep assignment (unassigned executable work).
const orphans = await run(
  'unassigned active identities',
  `select count(*)::int as n
     from revenue_identities i
    where i.organization_id = $1 and i.status = 'active'
      and not exists (
        select 1 from identity_assignments a
         where a.revenue_identity_id = i.id and a.organization_id = $1
      )`,
  [ORG],
)
if ((orphans[0]?.n ?? 0) === 0) ok('every active identity has a rep assignment')
else warn(`${orphans[0]?.n} active identities have no assignment`)

// 3. Executable profiles with no PRIMARY coverage (backup-only profiles).
const backupOnly = await run(
  'backup-only profiles executable',
  `select count(distinct i.profile_id)::int as n
     from revenue_identities i
     join identity_assignments a on a.revenue_identity_id = i.id and a.organization_id = $1
    where i.organization_id = $1 and i.status = 'active' and i.profile_id is not null
      and not exists (
        select 1 from profile_coverage c
         where c.profile_id = i.profile_id and c.organization_id = $1
           and c.role = 'PRIMARY' and c.active = true
      )`,
  [ORG],
)
if ((backupOnly[0]?.n ?? 0) === 0) ok('every executable profile has a PRIMARY coverage row')
else warn(`${backupOnly[0]?.n} executable profiles have no PRIMARY coverage`)

// 4. Profiles with executable work but no active coverage row.
const noCoverage = await run(
  'executable profiles with no coverage',
  `select count(*)::int as n
     from profiles p
    where p.organization_id = $1
      and exists (
        select 1 from identity_assignments a
         join revenue_identities i on i.id = a.revenue_identity_id
         where i.profile_id = p.id and a.organization_id = $1 and i.status = 'active'
      )
      and not exists (
        select 1 from profile_coverage c
         where c.profile_id = p.id and c.organization_id = $1 and c.active = true
      )`,
  [ORG],
)
if ((noCoverage[0]?.n ?? 0) === 0) ok('every executable profile has active coverage')
else warn(`${noCoverage[0]?.n} executable profiles have no active coverage row`)

// 5. Targets referencing a missing or inactive identity.
const badTargets = await run(
  'targets with invalid identity',
  `select count(*)::int as n
     from daily_targets t
    where t.organization_id = $1 and t.active = true
      and not exists (
        select 1 from revenue_identities i
         where i.id = t.revenue_identity_id and i.organization_id = $1 and i.status = 'active'
      )`,
  [ORG],
)
if ((badTargets[0]?.n ?? 0) === 0) ok('every active target references an active identity')
else warn(`${badTargets[0]?.n} active targets reference a missing/inactive identity`)

// 6. Open tasks referencing an archived profile.
const archivedTasks = await run(
  'open tasks on archived profiles',
  `select count(*)::int as n
     from assigned_tasks t
    where t.organization_id = $1 and t.status not in ('DONE','CANCELLED')
      and t.profile_id is not null
      and exists (
        select 1 from profiles p
         where p.id = t.profile_id and p.organization_id = $1
           and p.archived_at is not null
      )`,
  [ORG],
)
if ((archivedTasks[0]?.n ?? 0) === 0) ok('no open task references an archived profile')
else warn(`${archivedTasks[0]?.n} open tasks reference an archived profile`)

// 7. Cross-organisation references.
const crossOrg = await run(
  'cross-org references',
  `select
     (select count(*)::int from leads l where l.organization_id = $1 and l.owner_rep_id is not null
        and not exists (select 1 from reps r where r.id = l.owner_rep_id and r.organization_id = $1)) as lead_owner,
     (select count(*)::int from assigned_tasks t where t.organization_id = $1
        and not exists (select 1 from reps r where r.id = t.assignee_rep_id and r.organization_id = $1)) as task_assignee,
     (select count(*)::int from identity_assignments a where a.organization_id = $1
        and not exists (select 1 from reps r where r.id = a.rep_id and r.organization_id = $1)) as assignment_rep,
     (select count(*)::int from profile_coverage c where c.organization_id = $1
        and not exists (select 1 from reps r where r.id = c.rep_id and r.organization_id = $1)) as coverage_rep,
     (select count(*)::int from revenue_identities i where i.organization_id = $1 and i.profile_id is not null
        and not exists (select 1 from profiles p where p.id = i.profile_id and p.organization_id = $1)) as identity_profile`,
  [ORG],
)
const co = crossOrg[0] ?? {}
const coTotal = Object.values(co).reduce((a, b) => a + Number(b), 0)
if (coTotal === 0) ok('no cross-organisation references')
else warn(`cross-org references: ${JSON.stringify(co)}`)

await pool.end()

console.log(`\nProduction integrity audit — org ${ORG}`)
console.log('─'.repeat(64))
for (const [status, message] of findings) console.log(`${status === 'ok' ? 'ok  ' : 'WARN'} ${message}`)
const warnings = findings.filter(([s]) => s === 'WARN').length
console.log('─'.repeat(64))
console.log(`${findings.length - warnings} ok, ${warnings} warnings`)
