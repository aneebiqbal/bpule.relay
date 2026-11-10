import type { RelayTodayAction } from '@/lib/tasks/relay-today-action'
import type { AuthContext } from '@/lib/auth/organization'
import { createScoutStore } from '@/lib/store'
import { isCoverageActiveOn } from '@/lib/coverage/access'
import { loadOperatingPolicy } from '@/lib/org-clock/load'
import { orgToday } from '@/lib/org-clock'
import {
  listAssignedTaskRows,
  listLatestTaskComments,
  listUnreadTaskCommentCounts,
  resolveTaskAssigneeScope,
} from '@/lib/tasks/assigned-tasks'
import { toUnifiedTaskFromAction, toUnifiedTaskFromAssigned } from '@/lib/tasks/map-unified-task'
import type { UnifiedTask } from '@/lib/tasks/types'

/**
 * Merge derived queue actions + assigned task rows into one UnifiedTask list.
 *
 * Query budget:
 * - 1 assigned_tasks query (scoped)
 * - N enrichment selects batched (leads, reps, profiles) — not per task
 * - derived actions come from caller (existing queue loaders)
 */
export async function loadUnifiedTasks(input: {
  auth: AuthContext
  derivedActions: RelayTodayAction[]
  /** When loading for a single rep (Rep Home), pass their id. */
  forRepId?: string
  includeCompleted?: boolean
}): Promise<UnifiedTask[]> {
  const store = await createScoutStore()
  const client = store.getSupabaseClient()
  const { auth, derivedActions, forRepId, includeCompleted } = input

  const rows = await listAssignedTaskRows(client, auth, {
    includeCompleted: includeCompleted ?? true,
    assigneeRepId: forRepId,
  })

  // Batch enrichment
  const leadIds = [...new Set(rows.map((r) => r.lead_id).filter(Boolean))] as string[]
  const profileIds = [...new Set(rows.map((r) => r.profile_id).filter(Boolean))] as string[]

  const [leadsRes, profilesRes, coverageRes, activeCoverageRes] = await Promise.all([
    leadIds.length
      ? client.from('leads').select('id, company').eq('organization_id', auth.orgId).in('id', leadIds)
      : Promise.resolve({ data: [] as Array<{ id: string; company: string | null }> }),
    profileIds.length
      ? client
          .from('revenue_identities')
          .select('id, identity_name')
          .eq('organization_id', auth.orgId)
          .in('id', profileIds)
      : Promise.resolve({ data: [] as Array<{ id: string; identity_name: string }> }),
    // Canonical ownership + today's temporary execution, so a task can show
    // "Primary: Dawood · Current execution: Madiha" without moving ownership.
    profileIds.length
      ? client
          .from('profile_coverage')
          .select('profile_id, rep_id, role')
          .eq('organization_id', auth.orgId)
          .eq('active', true)
          .in('profile_id', profileIds)
          .limit(500)
      : Promise.resolve({ data: [] as Array<{ profile_id: string; rep_id: string; role: string }> }),
    profileIds.length
      ? client
          .from('coverage_assignments')
          .select('profile_id, covering_rep_id, effective_from, effective_until')
          .eq('organization_id', auth.orgId)
          .eq('status', 'ACTIVE')
          .in('profile_id', profileIds)
          .limit(500)
      : Promise.resolve({
          data: [] as Array<{
            profile_id: string
            covering_rep_id: string
            effective_from: string
            effective_until: string | null
          }>,
        }),
  ])

  // Coverage expiry is computed, not persisted: an ACTIVE row past its until
  // date must not hand execution to the covering rep.
  const policy = await loadOperatingPolicy(auth.orgId, client)
  const businessDate = orgToday(policy)

  const primaryRepByProfile = new Map<string, string>()
  const executionRepByProfile = new Map<string, string>()
  for (const row of (coverageRes.data ?? []) as Array<{ profile_id: string; rep_id: string; role: string }>) {
    if (row.role === 'PRIMARY') primaryRepByProfile.set(row.profile_id, row.rep_id)
  }
  for (const row of (activeCoverageRes.data ?? []) as Array<{
    profile_id: string
    covering_rep_id: string
    effective_from: string
    effective_until: string | null
  }>) {
    if (!isCoverageActiveOn({ effectiveFrom: row.effective_from, effectiveUntil: row.effective_until }, businessDate)) {
      continue
    }
    if (!executionRepByProfile.has(row.profile_id)) executionRepByProfile.set(row.profile_id, row.covering_rep_id)
  }
  // With no active coverage the primary is the execution rep.
  for (const [profileId, repId] of primaryRepByProfile) {
    if (!executionRepByProfile.has(profileId)) executionRepByProfile.set(profileId, repId)
  }

  const repIds = [
    ...new Set([
      ...rows.map((r) => r.assignee_rep_id),
      ...rows.map((r) => r.created_by_rep_id),
      ...rows.map((r) => r.transfer_requested_to).filter(Boolean),
      ...primaryRepByProfile.values(),
      ...executionRepByProfile.values(),
    ]),
  ] as string[]

  const repsQuery = repIds.length
    ? await client.from('reps').select('id, name').eq('organization_id', auth.orgId).in('id', repIds)
    : null
  const repsRes = (repsQuery?.data ?? []) as Array<{ id: string; name: string }>

  const companyByLead = new Map((leadsRes.data ?? []).map((l) => [l.id, l.company]))
  const nameByRep = new Map(repsRes.map((r) => [r.id, r.name]))
  const nameByProfile = new Map((profilesRes.data ?? []).map((p) => [p.id, p.identity_name]))

  // Bounded list projections: one latest comment + unread count per task, never
  // a full thread read.
  // Bounded preview: the list is already ordered by due/created, so the first
  // 200 assigned tasks carry the projection without an unbounded IN clause.
  const assignedIds = rows.map((row) => row.id).slice(0, 200)
  const [latestComments, unreadByTask] = await Promise.all([
    listLatestTaskComments(client, auth, assignedIds),
    listUnreadTaskCommentCounts(client, auth),
  ])

  const assigned: UnifiedTask[] = rows.map((row) =>
    toUnifiedTaskFromAssigned(row, {
      companyName: row.lead_id ? companyByLead.get(row.lead_id) ?? null : null,
      profileName: row.profile_id ? nameByProfile.get(row.profile_id) ?? null : null,
      createdByName: nameByRep.get(row.created_by_rep_id) ?? null,
      assigneeName: nameByRep.get(row.assignee_rep_id) ?? null,
      transferToName: row.transfer_requested_to ? nameByRep.get(row.transfer_requested_to) ?? null : null,
      primaryRepName: row.profile_id ? nameByRep.get(primaryRepByProfile.get(row.profile_id) ?? '') ?? null : null,
      executionRepName: row.profile_id
        ? nameByRep.get(executionRepByProfile.get(row.profile_id) ?? '') ?? null
        : null,
      latestComment: latestComments.get(row.id) ?? null,
      unreadCount: unreadByTask.get(row.id) ?? 0,
    }),
  )

  const derivedRepId = forRepId ?? auth.repId
  const derived: UnifiedTask[] = derivedActions.map((action) =>
    toUnifiedTaskFromAction(action, {
      organizationId: auth.orgId,
      assigneeRepId: derivedRepId,
    }),
  )

  // Dedup: never emit an assigned CUSTOM that duplicates a derived id surface —
  // derived ids are prefixed; assigned are separate. No cross-source id collision.
  return [...assigned, ...derived]
}

export async function canActorAssignTasks(auth: AuthContext): Promise<boolean> {
  return auth.isManager || auth.isAdmin || auth.isOwner
}

export async function listAssignableReps(auth: AuthContext): Promise<Array<{ id: string; name: string }>> {
  const store = await createScoutStore()
  const client = store.getSupabaseClient()
  const scope = await resolveTaskAssigneeScope(client, auth)

  let query = client
    .from('reps')
    .select('id, name')
    .eq('organization_id', auth.orgId)
    .order('name')

  if (scope.assigneeIds) {
    query = query.in('id', scope.assigneeIds)
  }

  const { data } = await query
  return (data ?? []).map((r) => ({ id: r.id as string, name: r.name as string }))
}
