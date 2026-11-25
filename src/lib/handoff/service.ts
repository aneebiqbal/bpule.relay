/**
 * Transfer Responsibilities — one durable handoff per departing rep.
 *
 * Transfers CURRENT operational ownership only:
 *   coverage seats (PRIMARY/OPERATOR/BACKUP), personal allocations, active
 *   leads, open tasks, application responsibility, new acknowledgements.
 *
 * It never deletes business history, never resets lead status, never removes
 * the account-level requirement, and never rewrites historical credits.
 * Prepared jobs have no owner column; access to them follows the profile
 * coverage transfer and is reported as such.
 */

import type { DbClient } from '@/lib/db/types'
import { CanonicalActivityResolver, loadActivityCatalog } from '@/lib/execution/activity-catalog'

export interface CoverageFact { profileId: string; identityId: string | null; role: string; priority: number | null }
export interface IdentityFact { id: string; identityName: string; channel: string | null; channelId: string | null; profileId: string | null }
export interface AllocationFact { planId: string; identityId: string; activityType: string; targetCount: number }
export interface LeadFact { id: string; company: string | null; contactName: string | null; status: string | null }
export interface TaskFact { id: string; title: string; kind: string | null; status: string; dueAt: string | null }
export interface ApplicationFact { id: string; jobId: string; profileId: string; status: string }
export interface PreparedFact { id: string; jobId: string; profileId: string }

export interface HandoffInput {
  organizationId: string
  fromRepId: string
  toRepId: string
  actorRepId: string
  coverage: CoverageFact[]
  identities: IdentityFact[]
  allocations: AllocationFact[]
  leads: LeadFact[]
  tasks: TaskFact[]
  applications: ApplicationFact[]
  preparedJobs: PreparedFact[]
  pendingAcknowledgements: Array<{ profileId: string; subject: string }>
  accessIssues: Array<{ profileId: string; note: string }>
  effortByKey: Record<string, number>
  replacementExistingMinutes: number
}

export interface HandoffPlan {
  fromRepId: string
  toRepId: string
  accounts: number
  responsibilities: number
  targetUnits: number
  estimatedMinutes: number
  leads: number
  tasks: number
  followUps: number
  applications: number
  preparedFollowAccess: number
  acknowledgementsToCreate: number
  accessIssues: number
  capacityWarnings: string[]
  ineligibleReasons: string[]
  untransferable: Array<{ kind: string; count: number; reason: string }>
}

export interface HandoffResult {
  operationId: string
  status: 'completed' | 'partial' | 'failed'
  transferred: {
    responsibilities: number
    allocations: number
    leads: number
    tasks: number
    applications: number
    acknowledgements: number
  }
  failedItems: Array<{ kind: string; id: string; error: string }>
  error: string | null
}

/** Pure preview assembly — unit-testable without a database. */
export function assembleHandoffPlan(input: HandoffInput): HandoffPlan {
  const ineligibleReasons: string[] = []
  if (input.fromRepId === input.toRepId) ineligibleReasons.push('The replacement rep must differ from the departing rep.')
  if (!input.toRepId) ineligibleReasons.push('Choose a replacement rep.')

  const accounts = new Set(input.coverage.map((row) => row.profileId)).size
  const targetUnits = input.allocations.reduce((sum, row) => sum + Math.max(0, row.targetCount), 0)
  const estimatedMinutes =
    input.allocations.reduce((sum, row) => sum + Math.max(0, row.targetCount) * (input.effortByKey[row.activityType] ?? 0), 0) +
    input.replacementExistingMinutes

  // Default planning budget is 8 h/day; organizations can override this later.
  // The warning never blocks or silently reduces work.
  const capacityWarnings: string[] = []
  if (estimatedMinutes > 480) {
    capacityWarnings.push(`Estimated ${estimatedMinutes} min against a default 480 min day; review capacity before confirming.`)
  }

  return {
    fromRepId: input.fromRepId,
    toRepId: input.toRepId,
    accounts,
    responsibilities: input.coverage.length,
    targetUnits,
    estimatedMinutes,
    leads: input.leads.length,
    tasks: input.tasks.length,
    followUps: input.tasks.filter((row) => (row.kind ?? '').toLowerCase().includes('follow')).length,
    applications: input.applications.length,
    preparedFollowAccess: input.preparedJobs.length,
    // A new acknowledgement is required for every transferred seat.
    acknowledgementsToCreate: input.coverage.length,
    accessIssues: input.accessIssues.length,
    capacityWarnings,
    ineligibleReasons,
    untransferable: [
      ...(input.preparedJobs.length
        ? [{ kind: 'prepared_jobs', count: input.preparedJobs.length, reason: 'No owner column; access follows the profile seat transfer.' }]
        : []),
      ...(input.accessIssues.length
        ? [{ kind: 'access_issues', count: input.accessIssues.length, reason: 'Requires manual resolution before execution work resumes.' }]
        : []),
    ],
  }
}

async function fetchIdentities(db: DbClient, orgId: string, profileIds: string[]): Promise<IdentityFact[]> {
  if (profileIds.length === 0) return []
  const { data, error } = await db
    .from('revenue_identities')
    .select('id, identity_name, channel, channel_id, profile_id')
    .eq('organization_id', orgId)
    .in('profile_id', profileIds)
    .limit(500)
  if (error) throw new Error(error.message)
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    identityName: String(row.identity_name ?? 'Account'),
    channel: (row.channel as string | null) ?? null,
    channelId: (row.channel_id as string | null) ?? null,
    profileId: (row.profile_id as string | null) ?? null,
  }))
}

/** Read-only gather of everything a departing rep currently owns. */
export async function loadHandoffInput(db: DbClient, orgId: string, fromRepId: string, toRepId: string, actorRepId: string): Promise<HandoffInput> {
  const coverageRes = await db
    .from('profile_coverage')
    .select('profile_id, role, priority, active')
    .eq('organization_id', orgId)
    .eq('rep_id', fromRepId)
    .eq('active', true)
    .limit(500)
  if (coverageRes.error) throw new Error(coverageRes.error.message)
  const coverageProfiles = ((coverageRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    profileId: String(row.profile_id),
    role: String(row.role),
    priority: (row.priority as number | null) ?? null,
  }))
  const profileIdsForIdentities = [...new Set(coverageProfiles.map((row) => row.profileId))]
  const identities = await fetchIdentities(db, orgId, profileIdsForIdentities)
  const identityByProfile = new Map<string, IdentityFact>()
  for (const identity of identities) {
    if (identity.profileId && !identityByProfile.has(identity.profileId)) identityByProfile.set(identity.profileId, identity)
  }
  const coverage: CoverageFact[] = coverageProfiles.map((row) => ({
    ...row,
    identityId: identityByProfile.get(row.profileId)?.id ?? null,
  }))
  const identityIds = identities.map((row) => row.id)

  const planRes = await db
    .from('daily_target_plans')
    .select('id, revenue_identity_id, activity_type, target_count, active')
    .eq('organization_id', orgId)
    .eq('active', true)
    .in('revenue_identity_id', identityIds.length ? identityIds : ['00000000-0000-0000-0000-000000000000'])
    .limit(1000)
  if (planRes.error) throw new Error(planRes.error.message)
  const planIds = ((planRes.data ?? []) as Array<Record<string, unknown>>).map((row) => String(row.id))
  const allocationRes = planIds.length
    ? await db
        .from('daily_plan_allocations')
        .select('plan_id, rep_id, target_count, active')
        .eq('organization_id', orgId)
        .eq('rep_id', fromRepId)
        .eq('active', true)
        .in('plan_id', planIds)
        .limit(1000)
    : { data: [], error: null }
  if (allocationRes.error) throw new Error(allocationRes.error.message)
  const planById = new Map(((planRes.data ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id), row]))
  const allocations: AllocationFact[] = ((allocationRes.data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const plan = planById.get(String(row.plan_id)) ?? {}
    return {
      planId: String(row.plan_id),
      identityId: String(plan.revenue_identity_id ?? ''),
      activityType: String(plan.activity_type ?? ''),
      targetCount: Number(row.target_count ?? 0),
    }
  })

  const [leadsRes, tasksRes, applicationsRes, acksRes, issuesRes] = await Promise.all([
    db.from('leads').select('id, company, contact_name, status').eq('organization_id', orgId).eq('owner_rep_id', fromRepId).eq('archived', false).limit(2000),
    db.from('assigned_tasks').select('id, title, kind, status, due_at').eq('organization_id', orgId).eq('assignee_rep_id', fromRepId).limit(1000),
    db.from('applications').select('id, job_id, profile_id, status').eq('organization_id', orgId).eq('rep_id', fromRepId).limit(500),
    db.from('responsibility_acknowledgements').select('profile_id, subject').eq('organization_id', orgId).eq('rep_id', fromRepId).is('acknowledged_at', null).limit(200),
    db.from('responsibility_acknowledgements').select('profile_id, access_issue_note').eq('organization_id', orgId).eq('rep_id', fromRepId).is('resolved_at', null).not('access_issue_at', 'is', null).limit(200),
  ])
  if (leadsRes.error) throw new Error(leadsRes.error.message)
  if (tasksRes.error) throw new Error(tasksRes.error.message)
  if (applicationsRes.error) throw new Error(applicationsRes.error.message)

  const profileIds = [...new Set(coverage.map((row) => row.profileId))]
  const profilesRes = profileIds.length
    ? await db.from('profiles').select('id').eq('organization_id', orgId).in('id', profileIds).limit(500)
    : { data: [], error: null }
  const ownedProfileIds = ((profilesRes.data ?? []) as Array<{ id: string }>).map((row) => row.id)
  const preparedRes = ownedProfileIds.length
    ? await db.from('prepared_jobs').select('id, job_id, profile_id').eq('organization_id', orgId).in('profile_id', ownedProfileIds).limit(500)
    : { data: [], error: null }
  if (preparedRes.error) throw new Error(preparedRes.error.message)

  const catalog = await loadActivityCatalog(db).catch(() => ({ channels: [], definitions: [], aliases: [] }))
  const resolver = new CanonicalActivityResolver(catalog)
  const effortByKey: Record<string, number> = {}
  for (const key of new Set(allocations.map((row) => row.activityType))) {
    effortByKey[key] = resolver.resolveActivityEffort(key)
  }

  const replacementMinutes = await replacementWorkloadMinutes(db, orgId, toRepId)

  return {
    organizationId: orgId,
    fromRepId,
    toRepId,
    actorRepId,
    coverage,
    identities,
    allocations,
    leads: ((leadsRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      company: (row.company as string | null) ?? null,
      contactName: (row.contact_name as string | null) ?? null,
      status: (row.status as string | null) ?? null,
    })),
    tasks: ((tasksRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      title: String(row.title ?? ''),
      kind: (row.kind as string | null) ?? null,
      status: String(row.status ?? ''),
      dueAt: (row.due_at as string | null) ?? null,
    })).filter((row) => !['done', 'completed', 'cancelled'].includes(row.status.toLowerCase())),
    applications: ((applicationsRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      jobId: String(row.job_id ?? ''),
      profileId: String(row.profile_id ?? ''),
      status: String(row.status ?? ''),
    })),
    preparedJobs: ((preparedRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      jobId: String(row.job_id ?? ''),
      profileId: String(row.profile_id ?? ''),
    })),
    pendingAcknowledgements: ((acksRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      profileId: String(row.profile_id),
      subject: String(row.subject ?? 'responsibility_transfer'),
    })),
    accessIssues: ((issuesRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      profileId: String(row.profile_id),
      note: String(row.access_issue_note ?? ''),
    })),
    effortByKey,
    replacementExistingMinutes: replacementMinutes,
  }
}

async function replacementWorkloadMinutes(db: DbClient, orgId: string, repId: string): Promise<number> {
  const alloc = await db
    .from('daily_plan_allocations')
    .select('plan_id, target_count, active')
    .eq('organization_id', orgId)
    .eq('rep_id', repId)
    .eq('active', true)
    .limit(1000)
  if (alloc.error) return 0
  const rows = (alloc.data ?? []) as Array<{ plan_id: string; target_count: number }>
  if (rows.length === 0) return 0
  const plans = await db
    .from('daily_target_plans')
    .select('id, activity_type')
    .eq('organization_id', orgId)
    .in('id', rows.map((row) => row.plan_id))
    .limit(1000)
  if (plans.error) return 0
  const activityById = new Map(((plans.data ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id), String(row.activity_type)]))
  const catalog = await loadActivityCatalog(db).catch(() => ({ channels: [], definitions: [], aliases: [] }))
  const resolver = new CanonicalActivityResolver(catalog)
  return rows.reduce(
    (sum, row) => sum + row.target_count * resolver.resolveActivityEffort(activityById.get(row.plan_id) ?? ''),
    0,
  )
}

interface Checkpoint {
  [kind: string]: { id: string; status: 'ok' | 'failed'; error?: string }
}

/**
 * Execute the transfer. Per-item checkpoints make a replay safe; a provider
 * without transactions still records partial progress honestly. Never claims
 * atomicity it does not have.
 */
export async function executeHandoff(
  db: DbClient,
  input: HandoffInput,
  operationId?: string,
  options: { suspendFromRep?: boolean } = {},
): Promise<HandoffResult> {
  const plan = assembleHandoffPlan(input)
  if (plan.ineligibleReasons.length > 0) {
    return { operationId: operationId ?? '', status: 'failed', transferred: emptyTransferred(), failedItems: [], error: plan.ineligibleReasons.join(' ') }
  }

  let opId = operationId ?? ''
  try {
    if (!opId) {
      const inserted = await db
        .from('responsibility_handoffs')
        .insert({
          organization_id: input.organizationId,
          from_rep_id: input.fromRepId,
          to_rep_id: input.toRepId,
          status: 'running',
          plan: plan as unknown as Record<string, unknown>,
          created_by: input.actorRepId,
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (inserted.error || !inserted.data) throw new Error(inserted.error?.message ?? 'Could not create the handoff operation.')
      opId = String((inserted.data as { id: string }).id)
    } else {
      await db.from('responsibility_handoffs').update({ status: 'running', started_at: new Date().toISOString() }).eq('id', opId)
    }
  } catch (error) {
    return { operationId: opId, status: 'failed', transferred: emptyTransferred(), failedItems: [], error: error instanceof Error ? error.message : 'Could not start the handoff.' }
  }

  const checkpoint: Checkpoint = {}
  const failedItems: Array<{ kind: string; id: string; error: string }> = []
  const transferred = emptyTransferred()
  const transferredSeats: Array<{ profileId: string; role: string; id: string }> = []

  const record = async (kind: keyof HandoffResult['transferred'], id: string, fn: () => Promise<void>) => {
    try {
      await fn()
      checkpoint[kind] = { id, status: 'ok' }
      transferred[kind] += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Transfer failed.'
      checkpoint[kind] = { id, status: 'failed', error: message }
      failedItems.push({ kind, id, error: message })
    }
  }

  // 1. Seats. Deactivate the departing seat; insert the replacement only when
  //    they do not already hold that role on the profile.
  for (const seat of input.coverage) {
    await record('responsibilities', seat.profileId, async () => {
      // One active seat per rep per profile: deactivate every seat the
      // departing rep holds here, not just the matching role.
      await db.from('profile_coverage').update({ active: false, updated_at: new Date().toISOString() }).eq('organization_id', input.organizationId).eq('profile_id', seat.profileId).eq('rep_id', input.fromRepId).eq('active', true)
      // One active seat per rep per profile regardless of role
      // (pc_active_rep_uniq): if the replacement already holds any seat, keep
      // their existing role instead of inserting a second conflicting row.
      const { data: existing } = await db.from('profile_coverage').select('id, role').eq('organization_id', input.organizationId).eq('profile_id', seat.profileId).eq('rep_id', input.toRepId).eq('active', true).maybeSingle()
      if (existing) {
        transferredSeats.push({
          profileId: seat.profileId,
          role: String((existing as { role?: string }).role ?? seat.role),
          id: String((existing as { id: string }).id),
        })
      } else {
        const inserted = await db.from('profile_coverage').insert({
          organization_id: input.organizationId,
          profile_id: seat.profileId,
          rep_id: input.toRepId,
          role: seat.role,
          priority: seat.priority ?? 99,
          active: true,
          created_by: input.actorRepId,
        }).select('id')
        if (inserted.error) throw new Error(inserted.error.message)
        const newId = String(((inserted.data?.[0] as { id: string } | undefined)?.id) ?? '')
        if (newId) transferredSeats.push({ profileId: seat.profileId, role: seat.role, id: newId })
      }
    })
  }

  // 2. Personal allocations. Replace the share; never add a second seat.
  for (const allocation of input.allocations) {
    await record('allocations', allocation.planId, async () => {
      const deactivated = await db.from('daily_plan_allocations').update({ active: false, updated_at: new Date().toISOString() })
        .eq('organization_id', input.organizationId)
        .eq('plan_id', allocation.planId)
        .eq('rep_id', input.fromRepId)
        .eq('active', true)
      if (deactivated.error) throw new Error(deactivated.error.message)
      const { data: existing } = await db.from('daily_plan_allocations').select('id').eq('organization_id', input.organizationId).eq('plan_id', allocation.planId).eq('rep_id', input.toRepId).eq('active', true).maybeSingle()
      if (!existing) {
        const inserted = await db.from('daily_plan_allocations').insert({
          organization_id: input.organizationId,
          plan_id: allocation.planId,
          rep_id: input.toRepId,
          target_count: allocation.targetCount,
          active: true,
          created_by: input.actorRepId,
        })
        if (inserted.error) throw new Error(inserted.error.message)
      }
    })
  }

  // 3. Active leads — owner moves, status and history untouched.
  for (const lead of input.leads) {
    await record('leads', lead.id, async () => {
      const updated = await db.from('leads').update({ owner_rep_id: input.toRepId })
        .eq('id', lead.id)
        .eq('organization_id', input.organizationId)
        .eq('owner_rep_id', input.fromRepId)
      if (updated.error) throw new Error(updated.error.message)
    })
  }

  // 4. Open tasks.
  for (const task of input.tasks) {
    await record('tasks', task.id, async () => {
      const updated = await db.from('assigned_tasks').update({ assignee_rep_id: input.toRepId, previous_assignee_rep_id: input.fromRepId })
        .eq('id', task.id)
        .eq('organization_id', input.organizationId)
        .eq('assignee_rep_id', input.fromRepId)
      if (updated.error) throw new Error(updated.error.message)
    })
  }

  // 5. Applications where the departing rep was the executor.
  for (const application of input.applications) {
    await record('applications', application.id, async () => {
      const updated = await db.from('applications').update({ rep_id: input.toRepId })
        .eq('id', application.id)
        .eq('organization_id', input.organizationId)
        .eq('rep_id', input.fromRepId)
      if (updated.error) throw new Error(updated.error.message)
    })
  }

  // 6. A fresh acknowledgement is required for every transferred seat. The
  //    subject must be a real coverage role by table constraint.
  for (const seat of transferredSeats) {
    await record('acknowledgements', seat.id, async () => {
      // Replays and a seat that already had a pending acknowledgement must not
      // violate the acknowledgement uniqueness constraints.
      const { data: pending } = await db
        .from('responsibility_acknowledgements')
        .select('id')
        .eq('organization_id', input.organizationId)
        .eq('profile_id', seat.profileId)
        .eq('rep_id', input.toRepId)
        .eq('subject', seat.role)
        .is('acknowledged_at', null)
        .maybeSingle()
      if (pending) return
      const inserted = await db.from('responsibility_acknowledgements').insert({
        organization_id: input.organizationId,
        profile_id: seat.profileId,
        rep_id: input.toRepId,
        subject: seat.role,
        source_row_id: seat.id,
        assigned_at: new Date().toISOString(),
        acknowledged_at: null,
      })
      if (inserted.error) throw new Error(inserted.error.message)
    })
  }

  // 7. Departure suspension (explicit): remove any remaining executable seat.
  if (options.suspendFromRep) {
    const suspended = await db.from('profile_coverage').update({ active: false, updated_at: new Date().toISOString() })
      .eq('organization_id', input.organizationId)
      .eq('rep_id', input.fromRepId)
      .eq('active', true)
    if (suspended.error) failedItems.push({ kind: 'suspension', id: input.fromRepId, error: suspended.error.message })
  }

  const status: HandoffResult['status'] = failedItems.length ? (transferred.responsibilities || transferred.allocations || transferred.leads || transferred.tasks || transferred.applications ? 'partial' : 'failed') : 'completed'
  const summary = {
    counts: { ...transferred },
    checkpoint,
    failedItems,
    completedAt: new Date().toISOString(),
  }
  try {
    await db.from('responsibility_handoffs').update({ status, result: summary, finished_at: new Date().toISOString(), error: failedItems.length ? `${failedItems.length} item(s) failed.` : null }).eq('id', opId)
  } catch {
    // The transfer itself already happened; persist nothing further here.
  }
  return { operationId: opId, status, transferred, failedItems, error: failedItems.length ? `${failedItems.length} item(s) failed.` : null }
}

function emptyTransferred(): HandoffResult['transferred'] {
  return { responsibilities: 0, allocations: 0, leads: 0, tasks: 0, applications: 0, acknowledgements: 0 }
}
