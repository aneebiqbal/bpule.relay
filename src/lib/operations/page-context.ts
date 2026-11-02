import type { DbClient } from '@/lib/db/types'
/**
 * Server-only page context for Phase 8 surfaces: auth, the user-scoped
 * client and the operational scope, resolved once per request.
 */
import { cache } from 'react'
import { measureLoader } from '@/lib/operations/instrumentation'
import { redirect } from 'next/navigation'
import { getAuthContext, type AuthContext } from '@/lib/auth/organization'
import { createScoutStore } from '@/lib/store'
import {
  canOpenTeamWorkspace,
  effectiveRepIds,
  filterRepIdsToScope,
  resolveOperationalScope,
  type OperationalScope,
} from '@/lib/operations/scope'

export interface OpsPageContext {
  auth: AuthContext
  client: DbClient
  scope: OperationalScope
  /** Lead-list scope param for drill-down links into /leads. */
  leadScope: 'team' | 'org' | 'profile'
}

const resolve = cache(async (): Promise<OpsPageContext | null> => {
  const auth = await getAuthContext()
  if (!auth) return null
  const client = (await createScoutStore()).getSupabaseClient()
  const scope = await resolveOperationalScope(client, auth)
  return {
    auth,
    client,
    scope,
    leadScope: scope.mode === 'org' ? 'org' : scope.mode === 'team' ? 'team' : 'profile',
  }
})

/** Any signed-in user. */
export async function requireOpsContext(): Promise<OpsPageContext> {
  const ctx = await resolve()
  if (!ctx) redirect('/login')
  return ctx
}

/** Manager / Admin / Owner. Reps go to their own numbers instead. */
export async function requireTeamContext(): Promise<OpsPageContext> {
  const ctx = await requireOpsContext()
  if (!canOpenTeamWorkspace(ctx.auth)) redirect('/performance')
  return ctx
}

/** Admin / Owner. */
export async function requireAdminOpsContext(): Promise<OpsPageContext> {
  const ctx = await requireOpsContext()
  if (!ctx.auth.isAdmin && !ctx.auth.isOwner) redirect('/dashboard')
  return ctx
}

/** Reps the actor may assign work to, for intervention menus. */
export async function assignableReps(ctx: OpsPageContext): Promise<Array<{ id: string; name: string }>> {
  if (ctx.scope.mode === 'own') return []
  let q = ctx.client.from('reps').select('id, name').eq('organization_id', ctx.auth.orgId).order('name')
  if (ctx.scope.repIds) q = q.in('id', ctx.scope.repIds)
  const { data } = await q.limit(500)
  return (data ?? []) as Array<{ id: string; name: string }>
}

/** People directory, once per request (header + overview share it). */
export const getPeopleDirectory = cache(async () => {
  const ctx = await requireTeamContext()
  const { loadPeopleDirectory } = await import('@/lib/operations/people')
  return measureLoader('team.directory', (c) => loadPeopleDirectory(c!, ctx.auth, ctx.scope), ctx.client)
})

/** Performance for a rep set + window, once per request. `repKey` is a sorted, comma-joined id list or 'scope'. */
export const getPerformance = cache(
  async (repKey: string, start: string, end: string, profileId: string | null, source: string | null) => {
    const ctx = await requireTeamContext()
    const { loadPerformance } = await import('@/lib/operations/performance')
    // Requested ids are intersected with scope — a URL can narrow, never widen.
    const repIds = repKey === 'scope' ? ctx.scope.repIds : filterRepIdsToScope(ctx.scope, repKey ? repKey.split(',') : [])
    return measureLoader('team.performance', (c) => loadPerformance(c!, {
      orgId: ctx.auth.orgId,
      repIds,
      start,
      end,
      profileId,
      source: source === 'linkedin' || source === 'upwork' || source === 'other' ? source : null,
    }), ctx.client)
  },
)

/**
 * Report scope from URL filters: rep / team narrow the operational scope
 * (never widen it). Reps are always scoped to themselves. Also returns the
 * filter options the viewer may use.
 */
export async function resolveReportContext(
  ctx: OpsPageContext,
  filters: { rep: string | null; team: string | null },
): Promise<{
  repIds: string[] | null
  teams: Array<{ id: string; name: string }>
  reps: Array<{ id: string; name: string }>
  profiles: Array<{ id: string; identity_name: string }>
}> {
  const managerUp = ctx.scope.mode !== 'own'
  const [directory, reps, profilesRes] = await Promise.all([
    managerUp ? getPeopleDirectory().catch(() => null) : Promise.resolve(null),
    managerUp ? assignableReps(ctx) : Promise.resolve([] as Array<{ id: string; name: string }>),
    ctx.client.from('revenue_identities').select('id, identity_name').eq('organization_id', ctx.auth.orgId).order('identity_name').limit(200),
  ])
  const teamMemberIds = managerUp && filters.team ? directory?.teams.find((t) => t.id === filters.team)?.memberIds ?? [] : null
  return {
    repIds: effectiveRepIds(ctx.scope, { repId: managerUp ? filters.rep : null, teamMemberIds }),
    teams: (directory?.teams ?? []).map((t) => ({ id: t.id, name: t.name })),
    reps,
    profiles: (profilesRes.data ?? []) as Array<{ id: string; identity_name: string }>,
  }
}
