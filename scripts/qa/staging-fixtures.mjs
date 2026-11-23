/**
 * Synthetic staging fixtures: two isolated organizations with real Better Auth
 * accounts, canonical assignments, shared/solo targets, leads, conversations,
 * tasks and a suspended user.
 *
 *   node scripts/qa/staging-fixtures.mjs
 *
 * Run after staging-bootstrap.mjs. Refuses any non-local database.
 */
import pg from 'pg'
import { hashPassword } from 'better-auth/crypto'

const URL = process.env.RELAY_STAGING_DATABASE_URL ?? 'postgres://mac@127.0.0.1:5433/relay_staging_local'
if (/aivencloud|relay_prod/i.test(URL)) {
  console.error(`refusing a non-local fixture target: ${URL}`)
  process.exit(2)
}
const PASSWORD = 'staging-password-1'

const id = (head, n) => `${head.padEnd(8, '0').slice(0, 8)}-4000-8000-0000-${String(n).padStart(12, '0')}`
const ORG_A = id('0a', 1)
const ORG_B = id('0b', 1)

const db = new pg.Client({ connectionString: URL })
await db.connect()

async function reset() {
  const statements = [
    'delete from daily_plan_allocations',
    'delete from daily_target_plans',
    'delete from assigned_tasks',
    'delete from messages',
    'delete from conversation_states',
    'delete from leads',
    'delete from identity_assignments',
    'delete from profile_coverage',
    'delete from revenue_identities',
    'delete from profiles',
    "delete from voice_profiles where rep_id in (select id from reps where id::text like '0%')",
    'delete from organization_roles where organization_id in ($1,$2)',
    "delete from reps where id::text like '0%'",
    'delete from organizations where id in ($1,$2)',
    'delete from neon_auth.account',
    'delete from neon_auth.session',
    "delete from neon_auth.user where id::text like '0%'",
  ]
  for (const sql of statements) await db.query(sql, sql.includes('$1') ? [ORG_A, ORG_B] : [])
}

async function user(email, name, repId, { banned = false } = {}) {
  const hash = await hashPassword(PASSWORD)
  await db.query(
    `insert into neon_auth."user" (id, name, email, "emailVerified", banned, "createdAt", "updatedAt")
     values ($1,$2,$3,true,$4,now(),now()) on conflict (id) do nothing`,
    [repId, name, email, banned],
  )
  await db.query(
    `insert into neon_auth.account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
     values ($1,$2,'credential',$4,$3,now(),now()) on conflict ("accountId","providerId") do nothing`,
    [repId, repId, hash, repId],
  )
}

async function rep(org, n, name, legacyRole) {
  const rid = id(org === ORG_A ? '0a' : '0b', n)
  await db.query(
    `insert into reps (id, name, role, auth_user_id, organization_id, created_at, timezone)
     values ($1,$2,$3,$1,$4,now(),'UTC') on conflict (id) do nothing`,
    [rid, name, legacyRole, org],
  )
  return rid
}

async function main() {
  await reset()
  const now = new Date().toISOString()
  await db.query(
    `insert into organizations (id, name, plan, timezone, working_days, holidays, settings)
     values ($1,'Staging Org A','active','UTC',array[1,2,3,4,5],'[]','{}'),
            ($2,'Staging Org B','active','Asia/Karachi',array[1,2,3,4,5],'[]','{}')
     on conflict (id) do nothing`,
    [ORG_A, ORG_B],
  )

  // People. Owner/Admin keep legacy reps.role='admin'; Manager/Member are 'rep'
  // so only organization_roles can grant them authority.
  const people = [
    ['owner', 1, 'A Owner', 'admin', 'OWNER'],
    ['admin', 2, 'A Admin', 'admin', 'ADMIN'],
    ['manager', 3, 'A Manager', 'rep', 'MANAGER'],
    ['member', 4, 'A Member', 'rep', 'MEMBER'],
    ['suspended', 5, 'A Suspended', 'rep', 'MEMBER'],
    ['bowner', 11, 'B Owner', 'admin', 'OWNER'],
    ['badmin', 12, 'B Admin', 'admin', 'ADMIN'],
    ['bmanager', 13, 'B Manager', 'rep', 'MANAGER'],
    ['bmember', 14, 'B Member', 'rep', 'MEMBER'],
  ]
  const repIds = {}
  for (const [key, n, name, legacy, orgRole] of people) {
    const org = key.startsWith('b') ? ORG_B : ORG_A
    const rid = await rep(org, n, name, legacy)
    repIds[key] = rid
    await user(`${key}.stg@${key.startsWith('b') ? 'org-b' : 'org-a'}.test`, name, rid, { banned: key === 'suspended' })
    await db.query(
      `insert into organization_roles (id, organization_id, person_id, role, granted_by, created_at, updated_at)
       values ($1,$2,$3,$4,$5,now(),now())
       on conflict do nothing`,
      [id('0c', n), org, rid, orgRole, repIds.owner ?? rid],
    )
    // A calibrated voice profile keeps the shell out of /onboarding.
    await db.query(
      `insert into voice_profiles (id, rep_id, organization_id, style_card, sample_source, calibrated_at, profile_id)
       values ($1,$2,$3,'{}','quiz',now(),null) on conflict (rep_id) do nothing`,
      [id('0c', 100 + n), rid, org],
    )
  }
  await db.query(`update organization_roles set granted_by = $1 where organization_id = $2 and granted_by is distinct from $1`, [repIds.owner, ORG_A])
  await db.query(`update organization_roles set granted_by = $1 where organization_id = $2 and granted_by is distinct from $1`, [repIds.bowner, ORG_B])

  // Profiles + identities for org A (shared LinkedIn lane + solo Upwork lane).
  const pLinked = id('0d', 1)
  const pUpwork = id('0d', 2)
  const iLinked = id('0e', 1)
  const iUpwork = id('0e', 2)
  // A third identity the member has NO seat or coverage on: used to prove scope denial.
  const pSolo = id('0d', 3)
  const iSolo = id('0e', 3)
  for (const [pid, plat, label, rep] of [[pLinked, 'linkedin', 'A LinkedIn', repIds.member], [pUpwork, 'upwork', 'A Upwork', repIds.manager]]) {
    await db.query(
      `insert into profiles (id, rep_id, platform, label, organization_id, person_id, display_name, readiness)
       values ($1,$2,$3,$4,$5,$1,'Staging profile','ready') on conflict (id) do nothing`,
      [pid, rep, plat, label, ORG_A],
    )
  }
  await db.query(
    `insert into profiles (id, rep_id, platform, label, organization_id, person_id, display_name, readiness)
     values ($1,$2,'linkedin','A Solo LinkedIn',$3,$1,'Solo profile','ready') on conflict (id) do nothing`,
    [pSolo, repIds.manager, ORG_A],
  )
  await db.query(
    `insert into revenue_identities (id, organization_id, slug, identity_name, channel, profile_id, status, created_at, updated_at)
     values ($1,$5,'a-linkedin','A LinkedIn','linkedin',$2,'active',now(),now()),
            ($3,$5,'a-upwork','A Upwork','upwork',$4,'active',now(),now()),
            ($6,$5,'a-solo','A Solo LinkedIn','linkedin',$7,'active',now(),now())
     on conflict (id) do nothing`,
    [iLinked, pLinked, iUpwork, pUpwork, ORG_A, iSolo, pSolo],
  )
  await db.query(
    `insert into identity_assignments (organization_id, revenue_identity_id, rep_id, assigned_by, created_at)
     values ($1,$2,$3,$4,now()), ($1,$5,$6,$4,now())
     on conflict do nothing`,
    [ORG_A, iLinked, repIds.manager, repIds.admin, iUpwork, repIds.manager],
  )
  await db.query(
    `insert into profile_coverage (organization_id, profile_id, rep_id, role, priority, active, created_by, created_at, updated_at)
     values ($1,$2,$3,'PRIMARY',1,true,$4,now(),now()),
            ($1,$2,$5,'OPERATOR',2,true,$4,now(),now())
     on conflict do nothing`,
    [ORG_A, pLinked, repIds.manager, repIds.admin, repIds.member],
  )
  // Active temporary cover: the manager works the member's Upwork profile.
  await db.query(
    `insert into coverage_assignments (id, organization_id, profile_id, primary_rep_id, covering_rep_id, effective_from,
                                        effective_until, reason, status, approved_by, created_by, created_at, updated_at)
     values ($1,$2,$3,$4,$5,(now() at time zone 'utc')::date - 1,null,'Staging coverage','ACTIVE',$6,$6,now(),now())`,
    [id('0d', 9), ORG_A, pUpwork, repIds.member, repIds.manager, repIds.admin],
  )

  // Targets: shared lane with allocations, plus an unallocated shared lane.
  const planShared = id('0f', 1)
  const planSolo = id('0f', 2)
  await db.query(
    `insert into daily_target_plans (id, organization_id, revenue_identity_id, activity_type, target_count, targetable, active, effective_from, created_at, updated_at)
     values ($1,$5,$2,'connection_request',20,true,true,(now() at time zone 'utc')::date - 1,now(),now()),
            ($6,$5,$2,'dm',10,true,true,(now() at time zone 'utc')::date - 1,now(),now()),
            ($3,$5,$4,'application',8,true,true,(now() at time zone 'utc')::date - 1,now(),now())
     on conflict (id) do nothing`,
    [planShared, iLinked, planSolo, iUpwork, ORG_A, id('0f', 12)],
  )
  await db.query(
    `insert into daily_plan_allocations (id, organization_id, plan_id, rep_id, target_count, active, created_by, created_at, updated_at)
     values ($1,$5,$2,$3,6,true,$4,now(),now()),
            ($1,$5,$2,$6,4,true,$4,now(),now())
     on conflict (id) do nothing`,
    [id('0f', 11), planShared, repIds.member, repIds.admin, ORG_A, repIds.manager],
  )

  // Leads + conversations.
  const mkLead = async (n, { owner, identity, profile, company, inbound, outbound }) => {
    const lid = id('1a', n)
    await db.query(
      `insert into leads (id, organization_id, owner_rep_id, revenue_identity_id, sender_profile_id, company, contact_name,
                          contact_title, status, source, direction, archived, is_test, score, verdict, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,'Founder','contacted','linkedin','inbound',false,false,11,'send',now())
       on conflict (id) do nothing`,
      [lid, ORG_A, owner, identity, profile, company, 'Contact ' + n],
    )
    if (outbound) {
      await db.query(
        `insert into messages (id, organization_id, lead_id, rep_id, sender_profile_id, revenue_identity_id, type, direction, sent_text, sent_at, created_at)
         values ($1,$2,$3,$4,$5,$6,'dm','outbound',$7,$8,now())`,
        [id('1b', n), ORG_A, lid, owner, profile, identity, 'Hello from Relay', outbound],
      )
    }
    if (inbound) {
      await db.query(
        `insert into messages (id, organization_id, lead_id, rep_id, sender_profile_id, revenue_identity_id, type, direction, sent_text, thread_status, sent_at, created_at)
         values ($1,$2,$3,$4,$5,$6,'reply','inbound',$7,'VERIFIED',$8,now())`,
        [id('1b', n + 100), ORG_A, lid, owner, profile, identity, 'Thanks, tell me more.', inbound],
      )
    }
    await db.query(
      `insert into conversation_states (organization_id, lead_id, stage, last_sent_at, last_reply_at, next_followup_at, memory, created_at, updated_at)
       values ($1,$2,'replied',$3,$4,now() + interval '2 days','{}',now(),now())
       on conflict (lead_id) do nothing`,
      [ORG_A, lid, outbound, inbound],
    )
    return lid
  }

  const hoursAgo = (h) => new Date(Date.now() - h * 3600_000).toISOString()
  const memberLeadWaiting = await mkLead(1, { owner: repIds.member, identity: iLinked, profile: pLinked, company: 'Member Client', inbound: hoursAgo(5), outbound: hoursAgo(9) })
  const managerLeadWaiting = await mkLead(2, { owner: repIds.manager, identity: iLinked, profile: pLinked, company: 'Manager Client', inbound: hoursAgo(6), outbound: hoursAgo(12) })
  const memberLeadOutbound = await mkLead(3, { owner: repIds.member, identity: iLinked, profile: pLinked, company: 'Waiting Client', inbound: null, outbound: hoursAgo(2) })
  const coveredLead = await mkLead(4, { owner: repIds.member, identity: iUpwork, profile: pUpwork, company: 'Covered Client', inbound: hoursAgo(8), outbound: hoursAgo(20) })
  // Owned by the manager on an identity the member has no seat or coverage on.
  const outOfScopeLead = await mkLead(5, { owner: repIds.manager, identity: iSolo, profile: pSolo, company: 'Solo Client', inbound: hoursAgo(3), outbound: hoursAgo(7) })

  // A foreign-org lead: exists in org B and must never surface for org A.
  await db.query(
    `insert into leads (id, organization_id, owner_rep_id, company, contact_name, status, source, archived, is_test, created_at)
     values ($1,$2,$3,'Foreign Co','Foreign Contact','contacted','linkedin',false,false,now()) on conflict (id) do nothing`,
    [id('1a', 99), ORG_B, repIds.bmember],
  )

  // Tasks for the member.
  await db.query(
    `insert into assigned_tasks (id, organization_id, assignee_rep_id, created_by_rep_id, kind, title, description, priority, due_at, status, created_at, updated_at)
     values ($1,$2,$3,$4,'FOLLOW_UP','Follow up with Waiting Client','Reach out today','HIGH',now() + interval '1 day','OPEN',now(),now())`,
    [id('1c', 1), ORG_A, repIds.member, repIds.manager],
  )

  const summary = {
    organizations: (await db.query('select count(*)::int n from organizations where id = any($1)', [[ORG_A, ORG_B]])).rows[0].n,
    authUsers: (await db.query('select count(*)::int n from neon_auth.user where id::text like \'0%\'')).rows[0].n,
    reps: (await db.query('select count(*)::int n from reps where id::text like \'0%\'')).rows[0].n,
    roles: (await db.query('select count(*)::int n from organization_roles')).rows[0].n,
    leads: (await db.query('select count(*)::int n from leads')).rows[0].n,
    plans: (await db.query('select count(*)::int n from daily_target_plans')).rows[0].n,
    allocations: (await db.query('select count(*)::int n from daily_plan_allocations')).rows[0].n,
    tasks: (await db.query('select count(*)::int n from assigned_tasks')).rows[0].n,
    ids: { ORG_A, ORG_B, memberLeadWaiting, managerLeadWaiting, memberLeadOutbound, coveredLead, outOfScopeLead },
    credentials: { emailSuffix: '@stg-a.test / @stg-b.test', password: PASSWORD },
  }
  console.log(JSON.stringify(summary, null, 1))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => db.end())
