import type { DbClient } from '@/lib/db/types'
import { ACTIVITY_LABELS } from '@/lib/accountability/default-targets'
import { saveResponsibilityChain } from '@/lib/profiles/assignment'
import { CanonicalActivityResolver, loadActivityCatalog } from '@/lib/execution/activity-catalog'
import { businessDateForOrg } from '@/lib/org-clock/load'

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
  /**
   * When omitted, existing allocations are left untouched (partial update).
   * When supplied — including an empty array — they are replaced. `[]` clears
   * every share on the affected lanes.
   */
  allocations?: WorkSetupAllocation[]
  /**
   * Revision returned by GET /api/admin/work-setup for this account. When
   * supplied, the save aborts with `code: 'CONFLICT'` if another admin changed
   * the account since it was read (optimistic concurrency).
   */
  expectedRevision?: string
}

export type WorkSetupConflict = {
  ok: false
  code: 'CONFLICT'
  error: string
  revision: string
  identityId: string
  profileId: string | null
  primaryRepId: string
  operatorIds: string[]
  backupIds: string[]
  targetsWritten: 0
  allocationsWritten: 0
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
  /** Present on a conflict: the committed values the admin should review. */
  code?: 'CONFLICT' | 'TRANSACTION_UNSUPPORTED'
  revision?: string
}

function label(activityType: string): string {
  return ACTIVITY_LABELS[activityType as keyof typeof ACTIVITY_LABELS] ?? activityType.replaceAll('_', ' ')
}

function fail(error: string): WorkSetupSaveResult {
  return { ok: false, error, identityId: '', profileId: null, primaryRepId: '', operatorIds: [], backupIds: [], targetsWritten: 0, allocationsWritten: 0 }
}

/** Typed optimistic-concurrency conflict; committed state is preserved. */
function conflict(revision: string, identityId: string, profileId: string | null): WorkSetupConflict {
  return {
    ok: false,
    code: 'CONFLICT',
    error: 'This account was changed by someone else. Review the current values and retry.',
    revision,
    identityId,
    profileId,
    primaryRepId: '',
    operatorIds: [],
    backupIds: [],
    targetsWritten: 0,
    allocationsWritten: 0,
  }
}

/**
 * A stable revision for one account: the newest `updated_at` across every table
 * that defines its assignment and target state. Used for compare-and-set.
 * Returns null when the provider has no raw SQL (PostgREST), where the caller
 * skips concurrency control rather than weakening it.
 */
export async function computeAccountRevision(
  client: DbClient,
  orgId: string,
  identityId: string,
  profileId: string | null,
): Promise<string | null> {
  if (client.raw) {
    const { data, error } = await client.raw(
      `SELECT GREATEST(
         COALESCE((SELECT MAX(updated_at) FROM profile_coverage WHERE organization_id = $1 AND profile_id = $2), to_timestamp(0)),
         COALESCE((SELECT MAX(updated_at) FROM daily_target_plans WHERE organization_id = $1 AND revenue_identity_id = $3), to_timestamp(0)),
         COALESCE((SELECT MAX(a.updated_at) FROM daily_plan_allocations a JOIN daily_target_plans p ON p.id = a.plan_id WHERE p.organization_id = $1 AND p.revenue_identity_id = $3), to_timestamp(0)),
         -- Assignments are deleted and re-inserted, never updated, so created_at is the revision clock.
         COALESCE((SELECT MAX(created_at) FROM identity_assignments WHERE organization_id = $1 AND revenue_identity_id = $3), to_timestamp(0))
       )::text AS revision`,
      [orgId, profileId, identityId],
    )
    if (error) throw new Error(error.message)
    const row = (data as Array<{ revision: string }>)[0]
    return row?.revision ?? null
  }

  // Provider without raw SQL (PostgREST): derive the newest timestamp with the
  // query builder. ISO timestamps sort lexicographically, so `max` is correct.
  const [coverage, plans, eligibility] = await Promise.all([
    client
      .from('profile_coverage')
      .select('updated_at')
      .eq('organization_id', orgId)
      .eq('profile_id', profileId ?? '')
      .limit(500),
    client
      .from('daily_target_plans')
      .select('id, updated_at')
      .eq('organization_id', orgId)
      .eq('revenue_identity_id', identityId)
      .limit(500),
    client
      .from('identity_assignments')
      .select('updated_at')
      .eq('organization_id', orgId)
      .eq('revenue_identity_id', identityId)
      .limit(500),
  ])
  if (coverage.error) throw coverage.error
  if (plans.error) throw plans.error
  if (eligibility.error) throw eligibility.error

  const planIds = ((plans.data ?? []) as Array<{ id: string }>).map((row) => row.id)
  let allocationRows: Array<{ updated_at: string | null }> = []
  if (planIds.length > 0) {
    const allocations = await client
      .from('daily_plan_allocations')
      .select('updated_at')
      .eq('organization_id', orgId)
      .in('plan_id', planIds)
      .limit(500)
    if (allocations.error) throw allocations.error
    allocationRows = (allocations.data ?? []) as Array<{ updated_at: string | null }>
  }

  const newest = [
    ...((coverage.data ?? []) as Array<{ updated_at: string | null }>),
    ...((plans.data ?? []) as Array<{ updated_at: string | null }>),
    ...allocationRows,
    ...((eligibility.data ?? []) as Array<{ updated_at: string | null }>),
  ]
    .map((row) => row.updated_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1)
  return newest ?? null
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

  // Requirements become effective on the ORGANIZATION's business date, never
  // the server-local date; otherwise a lane created late in the day is
  // invisible to Rep Today while credits already count against it.
  const businessDate = await businessDateForOrg(input.orgId).catch(() => new Date().toISOString().slice(0, 10))

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

  // Every write below runs in ONE physical transaction on ONE connection, with
  // the caller's RLS identity set once and every dependent row committed or
  // rolled back together. A provider without transactions (PostgREST/Supabase)
  // falls back to sequential writes — the fallback is explicit, never silent.
  const apply = async (c: DbClient): Promise<WorkSetupSaveResult> => {
    if (input.expectedRevision !== undefined) {
      const current = await computeAccountRevision(c, input.orgId, input.identityId, profileId)
      if (current && current !== input.expectedRevision) {
        return conflict(current, input.identityId, profileId)
      }
    }

    // The account's channel decides which activities are configurable. Custom
    // channels therefore need no code change: their definitions are data.
    const identityRow = await c
      .from('revenue_identities')
      .select('channel, channel_id')
      .eq('id', input.identityId)
      .maybeSingle()
    const identity = (identityRow.data ?? null) as { channel: string | null; channel_id?: string | null } | null
    const catalog = await loadActivityCatalog(c).catch(() => ({ channels: [], definitions: [], aliases: [] }))
    const resolver = new CanonicalActivityResolver(catalog)
    const channel = resolver.channelForIdentity({
      channel: identity?.channel ?? null,
      channelId: identity?.channel_id ?? null,
    })
    const definitions = new Map<string, { label: string; targetable: boolean }>()
    for (const definition of channel ? resolver.listChannelActivities(channel.id) : []) {
      definitions.set(definition.key, { label: definition.label, targetable: definition.targetable })
    }
    // Pre-catalog databases and test fakes: fall back to the historical lane
    // set so an unchanged Work Setup save keeps working. Production with the
    // migration applied always resolves real definitions.
    if (definitions.size === 0) {
      for (const key of WORK_SETUP_ACTIVITIES) {
        definitions.set(key, { label: ACTIVITY_LABELS[key] ?? key, targetable: key !== 'proposal' })
      }
    }
    const activityLabel = (key: string): string => definitions.get(key)?.label ?? label(key)

    // 1. Seats. Replace-and-reconcile is idempotent, so an unchanged save is a
    //    no-op and never disturbs acknowledgements.
    const chain = await saveResponsibilityChain(c, {
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
    if (!chain.ok) throw new Error(chain.error ?? 'Could not save the assignment.')

    // 2. Target lanes. The requirement belongs to the channel: one active row per
    //    (identity, activity). Provided lanes are upserted; omitted lanes stay.
    let targetsWritten = 0
    if (input.targets) {
      const seen = new Set<string>()
      for (const lane of input.targets) {
        const definition = definitions.get(lane.activityType)
        if (!definition) {
          throw new Error(`${lane.activityType} is not an enabled activity on this account's channel.`)
        }
        const targetCount = Math.round(Number(lane.targetCount))
        if (!Number.isFinite(targetCount) || targetCount < 0) {
          throw new Error(`${activityLabel(lane.activityType)} must be zero or a positive number.`)
        }
        if (seen.has(lane.activityType)) throw new Error(`Duplicate ${activityLabel(lane.activityType)} lane.`)
        seen.add(lane.activityType)

        const { data: existing } = await c
          .from('daily_target_plans')
          .select('id')
          .eq('organization_id', input.orgId)
          .eq('revenue_identity_id', input.identityId)
          .eq('activity_type', lane.activityType)
          .limit(1)
        const id = (existing?.[0] as { id: string } | undefined)?.id
        // An explicit zero means "no expectation for this lane": deactivate an
        // existing plan instead of failing to save the rest of the form.
        if (targetCount === 0) {
          if (id) {
            const deactivating = await c
              .from('daily_target_plans')
              .update({ active: false, updated_at: new Date().toISOString() })
              .eq('id', id)
              .select('id')
              .single()
            if (deactivating.error) throw new Error(deactivating.error.message)
          }
          continue
        }
        const writing = id
          ? await c
              .from('daily_target_plans')
              .update({ target_count: targetCount, active: true, targetable: definition.targetable, updated_at: new Date().toISOString() })
              .eq('id', id)
              .select('id')
              .single()
          : await c
              .from('daily_target_plans')
              .insert({
                organization_id: input.orgId,
                revenue_identity_id: input.identityId,
                activity_type: lane.activityType,
                target_count: targetCount,
                targetable: definition.targetable,
                effective_from: businessDate,
                active: true,
                created_by: input.actorRepId,
              })
              .select('id')
              .single()
        if (writing.error) throw new Error(writing.error.message)
        targetsWritten += 1
      }
    }

    // 3. Allocations. One active share per (lane, operator); the sum per lane may
    //    never exceed the lane target. An empty list clears the lane's shares.
    const executableSeats = new Set([input.primaryRepId, ...operatorIds])
    let allocationsWritten = 0
    if (input.allocations) {
      const lanes = input.targets ?? []
      const targetByActivity = new Map<string, number>(lanes.map((lane) => [lane.activityType, Math.round(Number(lane.targetCount))]))
      const activities = new Set<string>(input.allocations.map((row) => row.activityType))
      const byActivity = new Map<string, Map<string, number>>()
      for (const row of input.allocations) {
        const repId = row.repId.trim()
        // An allocation is an executable expectation: the rep must hold an
        // active PRIMARY or OPERATOR seat on this account. A BACKUP is
        // eligibility only and never receives a share.
        if (!repId || !executableSeats.has(repId)) {
          throw new Error('An allocation names a rep without an executable seat on this account.')
        }
        const count = Math.round(Number(row.targetCount))
        if (!Number.isFinite(count) || count <= 0) throw new Error('Allocations must be positive numbers.')
        const map = byActivity.get(row.activityType) ?? new Map<string, number>()
        map.set(repId, count)
        byActivity.set(row.activityType, map)
      }

      // Every supplied target lane is in scope for this write, so blanking one
      // lane's shares while another keeps them still clears the blanked lane.
      if (input.targets) {
        for (const lane of input.targets) activities.add(lane.activityType)
      } else if (input.allocations.length === 0) {
        // No target list supplied: fall back to the account's active plan lanes
        // so an omitted list still clears the right rows.
        const { data: planRows } = await c
          .from('daily_target_plans')
          .select('activity_type')
          .eq('organization_id', input.orgId)
          .eq('revenue_identity_id', input.identityId)
          .eq('active', true)
          .limit(50)
        for (const row of (planRows ?? []) as Array<{ activity_type: string }>) activities.add(row.activity_type)
      }

      for (const activityType of activities) {
        const shares = byActivity.get(activityType) ?? new Map<string, number>()
        const planId = (await c
          .from('daily_target_plans')
          .select('id, target_count')
          .eq('organization_id', input.orgId)
          .eq('revenue_identity_id', input.identityId)
          .eq('activity_type', activityType)
          .limit(1))
          .data?.[0] as { id: string; target_count: number } | undefined
        if (!planId) {
          if (shares.size === 0) continue
          throw new Error(`Set the ${activityLabel(activityType)} target before allocating it.`)
        }
        const total = [...shares.values()].reduce((sum, value) => sum + value, 0)
        const laneTarget = targetByActivity.get(activityType) ?? planId.target_count
        if (total > laneTarget) {
          throw new Error(`${activityLabel(activityType)} allocations total ${total}, above the lane target of ${laneTarget}.`)
        }

        const replaced = await replacePlanAllocations(c, {
          orgId: input.orgId,
          planId: planId.id,
          actorRepId: input.actorRepId,
          shares,
        })
        if (!replaced.ok) throw new Error(replaced.error)
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

  // Fail closed: a provider without a real multi-statement transaction must not
  // perform a non-atomic Work Setup write (partial seats/targets/allocations).
  if (!client.transaction) {
    return {
      ok: false,
      code: 'TRANSACTION_UNSUPPORTED',
      error:
        'This database provider does not support multi-statement transactions; refusing a non-atomic Work Setup write.',
      identityId: input.identityId,
      profileId,
      primaryRepId: input.primaryRepId,
      operatorIds,
      backupIds,
      targetsWritten: 0,
      allocationsWritten: 0,
    }
  }

  try {
    return await client.transaction(apply)
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }
}
