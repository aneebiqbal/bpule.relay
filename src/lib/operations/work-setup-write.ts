import type { DbClient } from '@/lib/db/types'
import { ACTIVITY_LABELS } from '@/lib/accountability/default-targets'
import { saveResponsibilityChain } from '@/lib/profiles/assignment'

/**
 * The ONE assignment + target write path for Admin → Work Setup.
 *
 * One call performs, in order:
 *   1. scope + identity + seat validation
 *   2. the canonical responsibility chain write (coverage + eligibility +
 *      acknowledgements + audit)
 *   3. the channel's daily target lanes
 *   4. the per-operator allocations under those lanes
 *
 * Every step is idempotent and org-scoped. No component writes these tables
 * directly, so two admins cannot produce conflicting assignments.
 */

export const WORK_SETUP_ACTIVITIES = [
  'email',
  'dm',
  'connection_request',
  'followup',
  'application',
  'proposal',
  'prospect_extracted',
  'other',
] as const

export type WorkSetupActivity = (typeof WORK_SETUP_ACTIVITIES)[number]

export interface WorkSetupTargetLane {
  activityType: WorkSetupActivity
  targetCount: number
}

export interface WorkSetupAllocation {
  activityType: WorkSetupActivity
  repId: string
  targetCount: number
}

export interface WorkSetupInput {
  orgId: string
  identityId: string
  primaryRepId: string
  operators: Array<{ repId: string; priority?: number }>
  backups: Array<{ repId: string; priority?: number }>
  actorRepId: string
  /** When omitted, the channel's existing plan is left untouched. */
  targets?: WorkSetupTargetLane[]
  /** When omitted, existing allocations are left untouched. */
  allocations?: WorkSetupAllocation[]
}

export interface WorkSetupSaveResult {
  ok: boolean
  error?: string
  identityId: string
  profileId: string | null
  primaryRepId: string
  operatorIds: string[]
  backupIds: string[]
  targetsWritten: number
  allocationsWritten: number
}

function label(activityType: string): string {
  return ACTIVITY_LABELS[activityType as keyof typeof ACTIVITY_LABELS] ?? activityType.replaceAll('_', ' ')
}

function fail(error: string): WorkSetupSaveResult {
  return { ok: false, error, identityId: '', profileId: null, primaryRepId: '', operatorIds: [], backupIds: [], targetsWritten: 0, allocationsWritten: 0 }
}

/**
 * Replace one lane's allocations without a data-loss window.
 *
 * `dpa_active_uniq` is a partial unique index on (plan_id, rep_id) WHERE active,
 * so a new share cannot be inserted while the old one is active. Deactivating
 * everything first would leave the lane with zero allocations if the following
 * insert failed. Instead an existing share is updated in place, a new share is
 * inserted, and only then are removed shares deactivated — a mid-write failure
 * can leave stale values but never an empty lane.
 *
 * shortcut: still not one SQL transaction; upgrade when DbClient grows a
 * transaction primitive and the Neon/Supabase adapters implement it.
 */
export async function replacePlanAllocations(
  client: DbClient,
  input: { orgId: string; planId: string; actorRepId: string; shares: Map<string, number> },
): Promise<{ ok: true; written: number } | { ok: false; error: string }> {
  const now = new Date().toISOString()
  for (const [repId, targetCount] of input.shares) {
    const { data: existingRows, error: readError } = await client
      .from('daily_plan_allocations')
      .select('id')
      .eq('organization_id', input.orgId)
      .eq('plan_id', input.planId)
      .eq('rep_id', repId)
      .eq('active', true)
      .limit(1)
    if (readError) return { ok: false, error: readError.message }
    const existingId = (existingRows?.[0] as { id: string } | undefined)?.id
    const { error: writeError } = existingId
      ? await client
          .from('daily_plan_allocations')
          .update({ target_count: targetCount, updated_at: now })
          .eq('id', existingId)
      : await client.from('daily_plan_allocations').insert({
          organization_id: input.orgId,
          plan_id: input.planId,
          rep_id: repId,
          target_count: targetCount,
          active: true,
          created_by: input.actorRepId,
        })
    if (writeError) return { ok: false, error: writeError.message }
  }

  const { data: currentRows, error: listError } = await client
    .from('daily_plan_allocations')
    .select('rep_id')
    .eq('organization_id', input.orgId)
    .eq('plan_id', input.planId)
    .eq('active', true)
    .limit(100)
  if (listError) return { ok: false, error: listError.message }
  const removeIds = [
    ...new Set(((currentRows ?? []) as Array<{ rep_id: string }>).map((row) => row.rep_id)),
  ].filter((repId) => !input.shares.has(repId))
  if (removeIds.length > 0) {
    const { error: deactivateError } = await client
      .from('daily_plan_allocations')
      .update({ active: false, updated_at: now })
      .eq('organization_id', input.orgId)
      .eq('plan_id', input.planId)
      .in('rep_id', removeIds)
    if (deactivateError) return { ok: false, error: deactivateError.message }
  }
  return { ok: true, written: input.shares.size }
}

export async function saveWorkSetup(client: DbClient, input: WorkSetupInput): Promise<WorkSetupSaveResult> {
  const { data: identity, error: identityError } = await client
    .from('revenue_identities')
    .select('id, profile_id, identity_name, channel, status')
    .eq('id', input.identityId)
    .eq('organization_id', input.orgId)
    .maybeSingle()
  if (identityError) return fail(identityError.message)
  if (!identity) return fail('Account not found in this organization.')
  if (!identity.profile_id) return fail('This account is not linked to a profile. Link it before assigning work.')
  if (identity.status === 'archived') return fail('An archived account cannot carry executable work.')

  const profileId = identity.profile_id as string

  const namedRepIds = [
    input.primaryRepId,
    ...input.operators.map((seat) => seat.repId),
    ...input.backups.map((seat) => seat.repId),
  ].filter((repId): repId is string => Boolean(repId))
  const { data: repRows, error: repError } = await client
    .from('reps')
    .select('id')
    .eq('organization_id', input.orgId)
    .in('id', [...new Set(namedRepIds)])
    .limit(500)
  if (repError) return fail(repError.message)
  const knownReps = new Set(((repRows ?? []) as Array<{ id: string }>).map((row) => row.id))
  if (!knownReps.has(input.primaryRepId)) return fail('The primary rep is not in this organization.')

  const operatorIds = [...new Set(input.operators.map((seat) => seat.repId).filter(Boolean))]
  const backupIds = [...new Set(input.backups.map((seat) => seat.repId).filter(Boolean))]
  if (operatorIds.includes(input.primaryRepId) || backupIds.includes(input.primaryRepId)) {
    return fail('The primary rep cannot also be an operator or a backup.')
  }
  const overlap = operatorIds.filter((repId) => backupIds.includes(repId))
  if (overlap.length > 0) return fail('A rep cannot be both an operator and a backup.')

  // 1. Seats. Replace-and-reconcile is idempotent, so an unchanged save is a
  //    no-op and never disturbs acknowledgements.
  const chain = await saveResponsibilityChain(client, {
    orgId: input.orgId,
    profileId,
    identityId: input.identityId,
    primaryRepId: input.primaryRepId,
    operators: operatorIds.map((repId, index) => ({ repId, priority: index + 1 })),
    backups: backupIds.map((repId, index) => ({ repId, priority: index + 1 })),
    actorRepId: input.actorRepId,
    auditEventType: 'work_setup_saved',
    auditDetail: { identity_id: input.identityId },
  })
  if (!chain.ok) return fail(chain.error ?? 'Could not save the assignment.')

  // 2. Target lanes. The requirement belongs to the channel: one active row per
  //    (identity, activity). Provided lanes are upserted; omitted lanes stay.
  let targetsWritten = 0
  if (input.targets) {
    const seen = new Set<string>()
    for (const lane of input.targets) {
      if (!WORK_SETUP_ACTIVITIES.includes(lane.activityType)) {
        return fail(`${lane.activityType} is not a valid activity.`)
      }
      const targetCount = Math.round(Number(lane.targetCount))
      if (!Number.isFinite(targetCount) || targetCount <= 0) {
        return fail(`${label(lane.activityType)} must be a positive number.`)
      }
      if (seen.has(lane.activityType)) return fail(`Duplicate ${label(lane.activityType)} lane.`)
      seen.add(lane.activityType)

      const { data: existing } = await client
        .from('daily_target_plans')
        .select('id')
        .eq('organization_id', input.orgId)
        .eq('revenue_identity_id', input.identityId)
        .eq('activity_type', lane.activityType)
        .limit(1)
      const id = (existing?.[0] as { id: string } | undefined)?.id
      const writing = id
        ? await client
            .from('daily_target_plans')
            .update({ target_count: targetCount, active: true, targetable: lane.activityType !== 'proposal', updated_at: new Date().toISOString() })
            .eq('id', id)
            .select('id')
            .single()
        : await client
            .from('daily_target_plans')
            .insert({
              organization_id: input.orgId,
              revenue_identity_id: input.identityId,
              activity_type: lane.activityType,
              target_count: targetCount,
              targetable: lane.activityType !== 'proposal',
              active: true,
              created_by: input.actorRepId,
            })
            .select('id')
            .single()
      if (writing.error) return fail(writing.error.message)
      targetsWritten += 1
    }
  }

  // 3. Allocations. One active share per (lane, operator); the sum per lane may
  //    never exceed the lane target.
  let allocationsWritten = 0
  if (input.allocations) {
    const lanes = input.targets ?? []
    const targetByActivity = new Map<string, number>(lanes.map((lane) => [lane.activityType, Math.round(Number(lane.targetCount))]))
    const byActivity = new Map<string, Map<string, number>>()
    for (const row of input.allocations) {
      const repId = row.repId.trim()
      if (!repId || !knownReps.has(repId)) return fail('An allocation names a rep outside this organization.')
      const count = Math.round(Number(row.targetCount))
      if (!Number.isFinite(count) || count <= 0) return fail('Allocations must be positive numbers.')
      const map = byActivity.get(row.activityType) ?? new Map<string, number>()
      map.set(repId, count)
      byActivity.set(row.activityType, map)
    }

    for (const [activityType, shares] of byActivity) {
      const planId = (await client
        .from('daily_target_plans')
        .select('id, target_count')
        .eq('organization_id', input.orgId)
        .eq('revenue_identity_id', input.identityId)
        .eq('activity_type', activityType)
        .limit(1))
        .data?.[0] as { id: string; target_count: number } | undefined
      if (!planId) return fail(`Set the ${label(activityType)} target before allocating it.`)
      const total = [...shares.values()].reduce((sum, value) => sum + value, 0)
      const laneTarget = targetByActivity.get(activityType) ?? planId.target_count
      if (total > laneTarget) {
        return fail(`${label(activityType)} allocations total ${total}, above the lane target of ${laneTarget}.`)
      }

      const replaced = await replacePlanAllocations(client, {
        orgId: input.orgId,
        planId: planId.id,
        actorRepId: input.actorRepId,
        shares,
      })
      if (!replaced.ok) return fail(replaced.error)
      allocationsWritten += replaced.written
    }
  }

  return {
    ok: true,
    identityId: input.identityId,
    profileId,
    primaryRepId: input.primaryRepId,
    operatorIds,
    backupIds,
    targetsWritten,
    allocationsWritten,
  }
}
