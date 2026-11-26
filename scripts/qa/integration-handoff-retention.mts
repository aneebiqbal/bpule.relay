/**
 * Throwaway integration proof: executes a real responsibility transfer and a
 * retention dry-run against the disposable staging database, then removes the
 * fixture rows it created. Run:
 *   RELAY_STAGING_DATABASE_URL=postgres://mac@127.0.0.1:5433/relay_staging_local \
 *     npx tsx scripts/qa/integration-handoff-retention.mts
 */
import 'dotenv/config'
import { serviceDbClient } from '@/lib/db/client'
import { loadHandoffInput, executeHandoff } from '@/lib/handoff/service'
import { executeRetention, previewRetention } from '@/lib/retention/executor'

const url = process.env.RELAY_STAGING_DATABASE_URL
if (!url) throw new Error('RELAY_STAGING_DATABASE_URL required')
process.env.DATABASE_URL = url
process.env.SERVICE_DATABASE_URL = url
process.env.DATABASE_SSL = 'false'
process.env.RELAY_DB_PROVIDER = 'postgres'

async function main() {
  const db = serviceDbClient()
  const orgResult = await db.from('organizations').select('id').limit(1)
  console.log('org query:', JSON.stringify(orgResult).slice(0, 300), 'provider', db.provider)
  const org = orgResult.data
  if (!org?.[0]) throw new Error('no organization')
  const orgId = String((org[0] as { id: string }).id)

  const { data: reps } = await db.from('reps').select('id, name').eq('organization_id', orgId).limit(2)
  if (!reps || reps.length < 2) throw new Error('fixtures missing')
  const [fromRep, toRep] = reps as Array<{ id: string; name: string }>
  const profileResult = await db.from('profiles').insert({
    organization_id: orgId,
    rep_id: fromRep.id,
    platform: 'linkedin',
    label: `Handoff fixture ${Date.now()}`,
  }).select('id')
  if (profileResult.error || !profileResult.data?.[0]) throw new Error(profileResult.error?.message ?? 'could not create fixture profile')
  const profileId = String((profileResult.data[0] as { id: string }).id)

  // Fixture: seat, plan, allocation, lead, task owned by the departing rep.
  await db.from('profile_coverage').insert({ organization_id: orgId, profile_id: profileId, rep_id: fromRep.id, role: 'PRIMARY', priority: 1, active: true })
  const identityResult = await db.from('revenue_identities').insert({
    organization_id: orgId, slug: `handoff-${Date.now()}`, identity_name: 'Handoff Identity', profile_id: profileId,
  }).select('id')
  console.log('identity insert:', JSON.stringify(identityResult).slice(0, 300))
  const identity = identityResult.data
  const identityId = String(((identity as Array<{ id: string }>)[0]).id)
  const planResult = await db.from('daily_target_plans').insert({
    organization_id: orgId,
    revenue_identity_id: identityId,
    activity_type: 'dm',
    target_count: 10,
    targetable: true,
    active: true,
  }).select('id')
  console.log('plan insert:', JSON.stringify(planResult).slice(0, 300))
  const plan = planResult.data
  const planId = String(((plan as Array<{ id: string }>)[0]).id)
  await db.from('daily_plan_allocations').insert({ organization_id: orgId, plan_id: planId, rep_id: fromRep.id, target_count: 10, active: true })
  const leadResult = await db.from('leads').insert({ organization_id: orgId, owner_rep_id: fromRep.id, company: `Handoff Co ${Date.now()}`, status: 'contacted' }).select('id')
  console.log('lead insert:', JSON.stringify(leadResult).slice(0, 300))
  const lead = leadResult.data
  const leadId = String(((lead as Array<{ id: string }>)[0]).id)
  const taskResult = await db.from('assigned_tasks').insert({
    organization_id: orgId, assignee_rep_id: fromRep.id, created_by_rep_id: fromRep.id,
    title: 'Handoff task', kind: 'FOLLOW_UP', priority: 'NORMAL', status: 'OPEN',
  }).select('id')
  console.log('task insert:', JSON.stringify(taskResult).slice(0, 300))
  const task = taskResult.data
  const taskId = String(((task as Array<{ id: string }>)[0]).id)

  try {
    const input = await loadHandoffInput(db, orgId, fromRep.id, toRep.id, fromRep.id)
    const result = await executeHandoff(db, input, undefined, { suspendFromRep: true })
    console.log('handoff:', JSON.stringify(result, null, 2))

    const checks = await Promise.all([
      db.from('profile_coverage').select('rep_id, active').eq('profile_id', profileId),
      db.from('daily_plan_allocations').select('rep_id, active').eq('plan_id', planId),
      db.from('leads').select('owner_rep_id').eq('id', leadId),
      db.from('assigned_tasks').select('assignee_rep_id').eq('id', taskId),
    ])
    console.log('coverage now:', JSON.stringify(checks[0].data))
    console.log('allocation now:', JSON.stringify(checks[1].data))
    console.log('lead owner now:', JSON.stringify(checks[2].data))
    console.log('task assignee now:', JSON.stringify(checks[3].data))

    const preview = await previewRetention(db)
    console.log('retention preview:', JSON.stringify(preview.candidates), 'protected:', JSON.stringify(preview.protected))
    const dry = await executeRetention(db, { dryRun: true, actorRepId: toRep.id, organizationId: orgId })
    console.log('retention dry-run:', JSON.stringify(dry))

    // Real ephemeral deletion: an expired discovery lock must be removed, while
    // protected business rows are never candidates.
    await db.raw(`insert into job_discovery_locks (lock_key, acquired_at, expires_at) values ('expired-test', now() - interval '2 hours', now() - interval '1 hour')`, [])
    const wet = await executeRetention(db, { dryRun: false, actorRepId: toRep.id, organizationId: orgId })
    const remaining = await db.raw<{ n: number }[]>(`select count(*)::int as n from job_discovery_locks where lock_key = 'expired-test'`, [])
    console.log('retention execute:', JSON.stringify(wet), 'expired lock remaining:', JSON.stringify(remaining.data))
    if ((remaining.data?.[0]?.n ?? 0) !== 0) throw new Error('expired lock was not purged')

    if (result.status !== 'completed') throw new Error(`handoff ${result.status}: ${result.error ?? ''}`)
  } finally {
    await db.from('responsibility_handoffs').delete().eq('organization_id', orgId)
    await db.from('retention_runs').delete().eq('organization_id', orgId)
    await db.raw(`delete from job_discovery_locks where lock_key = 'expired-test'`, [])
    await db.from('assigned_tasks').delete().eq('id', taskId)
    await db.from('leads').delete().eq('id', leadId)
    await db.from('daily_plan_allocations').delete().eq('plan_id', planId)
    await db.from('daily_target_plans').delete().eq('id', planId)
    await db.from('revenue_identities').delete().eq('id', identityId)
    await db.from('profiles').delete().eq('id', profileId)
    await db.from('profile_coverage').delete().eq('profile_id', profileId).eq('rep_id', toRep.id)
    await db.from('responsibility_acknowledgements').delete().eq('organization_id', orgId).eq('rep_id', toRep.id)
  }
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1) })
