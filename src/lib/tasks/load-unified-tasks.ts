import type { RelayTodayAction } from '@/lib/tasks/relay-today-action'
import type { AuthContext } from '@/lib/auth/organization'
import { createScoutStore } from '@/lib/store'
import {
  listAssignedTaskRows,
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
  const repIds = [
    ...new Set([
      ...rows.map((r) => r.assignee_rep_id),
      ...rows.map((r) => r.created_by_rep_id),
    ]),
  ]
  const profileIds = [...new Set(rows.map((r) => r.profile_id).filter(Boolean))] as string[]

  const [leadsRes, repsRes, profilesRes] = await Promise.all([
    leadIds.length
      ? client.from('leads').select('id, company').eq('organization_id', auth.orgId).in('id', leadIds)
      : Promise.resolve({ data: [] as Array<{ id: string; company: string | null }> }),
    repIds.length
      ? client.from('reps').select('id, name').eq('organization_id', auth.orgId).in('id', repIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    profileIds.length
      ? client
          .from('revenue_identities')
          .select('id, identity_name')
          .eq('organization_id', auth.orgId)
          .in('id', profileIds)
      : Promise.resolve({ data: [] as Array<{ id: string; identity_name: string }> }),
  ])

  const companyByLead = new Map((leadsRes.data ?? []).map((l) => [l.id, l.company]))
  const nameByRep = new Map((repsRes.data ?? []).map((r) => [r.id, r.name]))
  const nameByProfile = new Map((profilesRes.data ?? []).map((p) => [p.id, p.identity_name]))

  const assigned: UnifiedTask[] = rows.map((row) =>
    toUnifiedTaskFromAssigned(row, {
      companyName: row.lead_id ? companyByLead.get(row.lead_id) ?? null : null,
      profileName: row.profile_id ? nameByProfile.get(row.profile_id) ?? null : null,
      createdByName: nameByRep.get(row.created_by_rep_id) ?? null,
      assigneeName: nameByRep.get(row.assignee_rep_id) ?? null,
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
