import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { getAuthContext } from '@/lib/auth/organization'
import { loadOperatingPolicy } from '@/lib/org-clock/load'
import { orgTodayRange, orgWeekRange } from '@/lib/org-clock'
import type { UpworkApplication } from '@/lib/domain/types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/upwork/connects
 *
 * Real connects from submitted applications only — never from generated
 * proposals. Grouped by rep, profile and revenue identity, with today/week
 * windows in the organization's timezone.
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const store = await createScoutStore()
  const policy = await loadOperatingPolicy(authCtx.orgId)
  const today = orgTodayRange(policy)
  const week = orgWeekRange(policy)
  const isAdmin = Boolean(authCtx.isAdmin || authCtx.isOwner)

  const applications = await store.listUpworkApplications({
    repIds: isAdmin ? [] : [authCtx.repId],
    includeArchived: true,
  })

  const profileIds = [...new Set(applications.map((a) => a.personProfileId).filter((x): x is string => Boolean(x)))]
  const identityIds = [...new Set(applications.map((a) => a.revenueIdentityId).filter((x): x is string => Boolean(x)))]
  const client = store.getSupabaseClient()

  const [profileRows, identityRows] = await Promise.all([
    profileIds.length > 0
      ? client.from('profiles').select('id, display_name, full_name, label').in('id', profileIds)
      : Promise.resolve({ data: [] as Array<{ id: string; display_name: string | null; full_name: string | null; label: string | null }>, error: null }),
    identityIds.length > 0
      ? client.from('revenue_identities').select('id, identity_name').in('id', identityIds)
      : Promise.resolve({ data: [] as Array<{ id: string; identity_name: string | null }>, error: null }),
  ])

  const profileName = new Map((profileRows.data ?? []).map((p) => [p.id as string, p.display_name ?? p.full_name ?? p.label ?? 'Unknown']))
  const identityName = new Map((identityRows.data ?? []).map((i) => [i.id as string, i.identity_name ?? 'Unknown']))

  const connectsOf = (a: { connectsSpent: number | null; boostConnects: number }) =>
    (a.connectsSpent ?? 0) + (a.boostConnects ?? 0)

  const inRange = (a: { submittedAt: string | null }, range: { start: string; end: string }) =>
    Boolean(a.submittedAt && a.submittedAt >= range.start && a.submittedAt < range.end)

  const sum = (rows: typeof applications) => rows.reduce((total, a) => total + connectsOf(a), 0)

  const groupBy = (
    rows: UpworkApplication[],
    keyOf: (row: UpworkApplication) => string,
  ) => {
    const out = new Map<string, { key: string; connects: number; applications: number }>()
    for (const row of rows) {
      const key = keyOf(row)
      const entry = out.get(key) ?? { key, connects: 0, applications: 0 }
      entry.connects += connectsOf(row)
      entry.applications += 1
      out.set(key, entry)
    }
    return [...out.values()]
  }

  const nameFor = (row: { personProfileId: string | null; revenueIdentityId: string | null }) =>
    profileName.get(row.personProfileId ?? '') ?? identityName.get(row.revenueIdentityId ?? '') ?? 'Unknown'

  const perProfile = groupBy(applications, nameFor).map((g) => ({
    key: g.key,
    name: g.key,
    connects: g.connects,
    applications: g.applications,
  }))
  const perIdentity = groupBy(applications, (row) => identityName.get(row.revenueIdentityId ?? '') ?? 'Unknown').map((g) => ({
    key: g.key,
    name: g.key,
    connects: g.connects,
    applications: g.applications,
  }))
  const perRep = groupBy(applications, (row) => row.repId ?? 'unknown').map((g) => ({
    key: g.key,
    connects: g.connects,
    applications: g.applications,
  }))

  const recentJobs = applications.slice(0, 10).map((a) => ({
    id: a.id,
    jobId: a.jobId,
    title: a.proposalText?.slice(0, 60) ?? '',
    connects: connectsOf(a),
    submittedAt: a.submittedAt,
  }))

  return NextResponse.json({
    todayUsed: sum(applications.filter((a) => inRange(a, today))),
    weekUsed: sum(applications.filter((a) => inRange(a, week))),
    totalUsed: sum(applications),
    todayCount: applications.filter((a) => inRange(a, today)).length,
    weekCount: applications.filter((a) => inRange(a, week)).length,
    appliedCount: applications.length,
    perProfile,
    perIdentity,
    perRep,
    recentJobs,
    timezone: policy.timezone,
  })
}
