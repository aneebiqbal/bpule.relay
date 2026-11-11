import type { DbClient } from '@/lib/db/types'
import { listExecutableIdentitiesForRep } from '@/lib/coverage/access'
import { getInboxCountsForRep } from '@/lib/operations/inbox-counts'
import { countOverdueAssignedByRep } from '@/lib/tasks/assigned-tasks'
import { personNameFromProfile } from '@/lib/profiles/person-name'
import { normalizeChannel } from '@/lib/profiles/channel'
import { businessDateRange, currentInstant, orgDate } from '@/lib/org-clock'
import { loadOperatingPolicy } from '@/lib/org-clock/load'

/**
 * THE rep operating plan — one read model for "who works which channel, and
 * what is expected of them today".
 *
 * Consumers: Rep Home, Team → People, Rep Detail, Daily Targets, Team Today.
 * It reuses the canonical execution scope (`listExecutableIdentitiesForRep`)
 * and the canonical Inbox counts, so every surface agrees by construction.
 */

export interface OperatingTarget {
  targetId: string
  activityType: string
  targetCount: number
  completedCount: number
  remaining: number
  status: string | null
}

export interface OperatingResponsibility {
  identityId: string
  identityName: string
  channel: string
  profileId: string | null
  /** Canonical person key — the profile row that groups a person's channels. */
  personKey: string
  personName: string
  role: 'primary' | 'coverage'
  coverageUntil: string | null
  coveragePrimaryRepId: string | null
  readiness: boolean
  targets: OperatingTarget[]
  target: number
  /** This rep's contribution today. */
  completed: number
  remaining: number
  /** The channel's total across every operator (the shared requirement). */
  profileCompleted: number
  /** How many reps contributed today; >1 means the requirement is shared. */
  contributorCount: number
  assignedAt: string | null
  /** Assigned on the current operating day and access not yet confirmed. */
  isNew: boolean
}

export interface RepOperatingPlan {
  repId: string
  repName: string
  businessDate: string
  timezone: string
  today: {
    target: number
    completed: number
    remaining: number
    repliesWaiting: number
    followUpsDue: number
    overdueTasks: number
  }
  responsibilities: OperatingResponsibility[]
  coverage: OperatingResponsibility[]
  needsSetup: Array<{ identityId: string; personName: string; channel: string; reason: string }>
}

export async function loadRepOperatingPlan(
  client: DbClient,
  input: { orgId: string; repId: string; repName?: string | null; now?: Date },
): Promise<RepOperatingPlan> {
  const now = input.now ?? currentInstant()
  const policy = await loadOperatingPolicy(input.orgId, client)
  const businessDate = orgDate(now, policy.timezone)
  const range = businessDateRange(businessDate, policy.timezone)

  const executable = await listExecutableIdentitiesForRep(client, input.orgId, input.repId, businessDate)
  const executableByIdentity = new Map(executable.map((row) => [row.id, row]))

  const identityRows = executable.length
    ? await client
        .from('revenue_identities')
        .select('id, profile_id, identity_name, channel, person_key, status')
        .eq('organization_id', input.orgId)
        .in('id', executable.map((row) => row.id))
        .limit(500)
    : { data: [] as Array<Record<string, unknown>>, error: null }
  if (identityRows.error) throw identityRows.error

  const personKeys = [
    ...new Set((identityRows.data ?? []).map((row) => (row.person_key as string | null) ?? (row.profile_id as string | null)).filter(Boolean)),
  ] as string[]
  const personRows = personKeys.length
    ? await client
        .from('profiles')
        .select('id, display_name, full_name, label')
        .eq('organization_id', input.orgId)
        .in('id', personKeys)
        .limit(200)
    : { data: [] as Array<Record<string, unknown>>, error: null }
  if (personRows.error) throw personRows.error
  const personNameById = new Map(
    (personRows.data ?? []).map((row) => [row.id as string, personNameFromProfile(row)]),
  )

  const [targetRows, accountabilityRows, profileAccountabilityRows, readinessRows] = await Promise.all([
    executable.length
      ? client
          .from('daily_target_plans')
          .select('id, revenue_identity_id, activity_type, target_count, targetable, active')
          .eq('organization_id', input.orgId)
          .eq('active', true)
          .in('revenue_identity_id', executable.map((row) => row.id))
          .limit(500)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
    executable.length
      ? client
          .from('daily_accountability')
          .select('revenue_identity_id, activity_type, completed_count, status')
          .eq('organization_id', input.orgId)
          .eq('rep_id', input.repId)
          .eq('target_date', businessDate)
          .in('revenue_identity_id', executable.map((row) => row.id))
          .limit(500)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
    // Every operator's contribution to the same channel plan, so a shared
    // requirement is never presented as one rep's personal target.
    executable.length
      ? client
          .from('daily_accountability')
          .select('revenue_identity_id, rep_id, completed_count')
          .eq('organization_id', input.orgId)
          .eq('target_date', businessDate)
          .in('revenue_identity_id', executable.map((row) => row.id))
          .limit(1000)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
    executable.length
      ? client
          .from('profile_readiness')
          .select('profile_id, rep_id')
          .eq('organization_id', input.orgId)
          .eq('rep_id', input.repId)
          .in('profile_id', executable.map((row) => row.profileId).filter((id): id is string => Boolean(id)))
          .limit(200)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
  ])
  if (targetRows.error) throw targetRows.error
  if (accountabilityRows.error) throw accountabilityRows.error
  if (profileAccountabilityRows.error) throw profileAccountabilityRows.error
  if (readinessRows.error) throw readinessRows.error

  const profileCompletedByIdentity = new Map<string, number>()
  const contributorsByIdentity = new Map<string, Set<string>>()
  for (const row of profileAccountabilityRows.data ?? []) {
    const identityId = row.revenue_identity_id as string
    profileCompletedByIdentity.set(
      identityId,
      (profileCompletedByIdentity.get(identityId) ?? 0) + (row.completed_count as number),
    )
    const contributors = contributorsByIdentity.get(identityId) ?? new Set<string>()
    contributors.add(row.rep_id as string)
    contributorsByIdentity.set(identityId, contributors)
  }

  const accountabilityByKey = new Map(
    (accountabilityRows.data ?? []).map((row) => [
      `${row.revenue_identity_id as string}:${row.activity_type as string}`,
      row,
    ]),
  )
  const readyProfileIds = new Set((readinessRows.data ?? []).map((row) => row.profile_id as string))

  const responsibilities: OperatingResponsibility[] = []
  for (const row of identityRows.data ?? []) {
    const executableRow = executableByIdentity.get(row.id as string)
    if (!executableRow) continue
    const profileId = (row.profile_id as string | null) ?? null
    const personKey = ((row.person_key as string | null) ?? profileId ?? (row.id as string))
    const targets: OperatingTarget[] = (targetRows.data ?? [])
      .filter((target) => target.revenue_identity_id === row.id)
      .map((target) => {
        const accountability = accountabilityByKey.get(`${row.id}:${target.activity_type}`)
        const targetCount = (target.target_count as number) ?? 0
        const completedCount = (accountability?.completed_count as number | null) ?? 0
        return {
          targetId: target.id as string,
          activityType: target.activity_type as string,
          targetCount,
          completedCount,
          remaining: Math.max(0, targetCount - completedCount),
          status: (accountability?.status as string | null) ?? null,
        }
      })
    const target = targets.reduce((sum, entry) => sum + entry.targetCount, 0)
    const completed = targets.reduce((sum, entry) => sum + entry.completedCount, 0)
    const assignedAt = executableRow.assignedAt
    // NEW is derived from events, never a manual flag: it expires once access is
    // confirmed, the rep has started work, or the first operating day ends.
    const readiness = profileId ? readyProfileIds.has(profileId) : false
    const isNew = assignedAt !== null && assignedAt >= range.start && !readiness && completed === 0
    responsibilities.push({
      identityId: row.id as string,
      identityName: (row.identity_name as string) ?? 'Unnamed',
      channel: normalizeChannel(row.channel as string | null),
      profileId,
      personKey,
      personName: personNameById.get(personKey) ?? (row.identity_name as string) ?? 'Unnamed',
      role: executableRow.access === 'coverage' ? 'coverage' : 'primary',
      coverageUntil: executableRow.coverageEffectiveUntil ?? null,
      coveragePrimaryRepId: executableRow.coveragePrimaryRepId ?? null,
      readiness,
      targets,
      target,
      completed,
      remaining: Math.max(0, target - completed),
      profileCompleted: profileCompletedByIdentity.get(row.id as string) ?? 0,
      contributorCount: contributorsByIdentity.get(row.id as string)?.size ?? 0,
      assignedAt,
      isNew,
    })
  }

  // Primary first, then coverage; within each, by person then channel.
  const byPersonThenChannel = (a: OperatingResponsibility, b: OperatingResponsibility) =>
    a.personName.localeCompare(b.personName) || a.channel.localeCompare(b.channel)
  const primary = responsibilities.filter((row) => row.role === 'primary').sort(byPersonThenChannel)
  const coverage = responsibilities.filter((row) => row.role === 'coverage').sort(byPersonThenChannel)

  const inbox = executable.length
    ? await getInboxCountsForRep(client, {
        orgId: input.orgId,
        repId: input.repId,
        executableIdentities: executable.map((row) => ({ id: row.id, profileId: row.profileId })),
        coveredIdentityIds: executable.filter((row) => row.access === 'coverage').map((row) => row.id),
      }).catch(() => null)
    : null
  const overdueByRep = await countOverdueAssignedByRep(client, input.orgId, [input.repId], now).catch(
    () => new Map<string, number>(),
  )

  const todayTarget = primary.reduce((sum, row) => sum + row.target, 0)
  const todayCompleted = primary.reduce((sum, row) => sum + row.completed, 0)

  const needsSetup = primary
    .filter((row) => row.target === 0 || !row.readiness)
    .map((row) => ({
      identityId: row.identityId,
      personName: row.personName,
      channel: row.channel,
      reason: row.target === 0 ? 'No daily plan' : 'Access not confirmed',
    }))

  return {
    repId: input.repId,
    repName: input.repName ?? '',
    businessDate,
    timezone: policy.timezone,
    today: {
      target: todayTarget,
      completed: todayCompleted,
      remaining: Math.max(0, todayTarget - todayCompleted),
      repliesWaiting: inbox?.needsReply ?? 0,
      followUpsDue: inbox?.followups ?? 0,
      overdueTasks: overdueByRep.get(input.repId) ?? 0,
    },
    responsibilities: primary,
    coverage,
    needsSetup,
  }
}
