import { createServerSupabase } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { computeStatus } from '@/lib/relay/accountability-engine'
import { currentInstant, isOrgWorkingDay, orgDate, workdayProgress, type OperatingPolicy } from '@/lib/org-clock'
import { loadOperatingPolicy } from '@/lib/org-clock/load'
import { listExecutableIdentitiesForRep } from '@/lib/coverage/access'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const supabase = await createServerSupabase()
  const org = user.organization
  const rep = user.rep

  const policy: OperatingPolicy = await loadOperatingPolicy(org.id)
  const now = currentInstant()
  const businessDate = orgDate(now, policy.timezone)
  const isWorking = isOrgWorkingDay(policy, businessDate)

  // Canonical execution scope: active PRIMARY ownership plus active coverage,
  // minus any profile under REPLACE coverage. Backup eligibility is not
  // execution, so a backup-only rep carries no target lanes here.
  const executable = await listExecutableIdentitiesForRep(supabase, org.id, rep.id, businessDate)

  if (executable.length === 0) {
    return NextResponse.json({
      repName: rep.name,
      isWorkingDay: isWorking,
      totalTarget: 0,
      totalCompleted: 0,
      totalRemaining: 0,
      overallStatus: 'on_track',
      assignedIdentities: [],
      notifications: [],
    })
  }

  const identityIds = executable.map((row) => row.id)
  // The identity rows are a second read rather than a PostgREST embed
  // (`identity:revenue_identities`), which the Neon adapter cannot translate.
  const { data: identityRows } = await supabase
    .from('revenue_identities')
    .select('*')
    .in('id', identityIds)
  const identityById = new Map((identityRows ?? []).map((r) => [r.id as string, r]))
  const assignmentsWithIdentity = executable.map((row) => ({
    id: row.assignmentId,
    revenue_identity_id: row.id,
    identity: identityById.get(row.id) ?? null,
    // The canonical execution scope says whether this is primary ownership,
    // an operator seat or temporary cover — the operator's precise role.
    role: row.access,
  }))
  const { data: targets } = await supabase
    .from('daily_target_plans')
    .select('*')
    .in('revenue_identity_id', identityIds)
    .eq('active', true)

  const today = businessDate
  const { data: accountability } = await supabase
    .from('daily_accountability')
    .select('*')
    .eq('rep_id', rep.id)
    .eq('target_date', today)
    .eq('organization_id', org.id)
  // The personal-expectation rule: an explicit allocation wins; a lane with more
  // than one seat is shared and carries no personal requirement until allocated.
  const [allocations, coverage] = await Promise.all([
    supabase
      .from('daily_plan_allocations')
      .select('plan_id, rep_id, target_count')
      .eq('organization_id', org.id)
      .eq('active', true)
      .limit(2000),
    supabase
      .from('profile_coverage')
      .select('profile_id, rep_id, role')
      .eq('organization_id', org.id)
      .eq('active', true)
      .in('role', ['PRIMARY', 'OPERATOR'])
      .limit(2000),
  ])
  const seatsByProfile = new Map<string, number>()
  for (const row of coverage.data ?? []) {
    seatsByProfile.set(row.profile_id, (seatsByProfile.get(row.profile_id) ?? 0) + 1)
  }
  const allocationByPlan = new Map<string, number>()
  for (const row of allocations.data ?? []) {
    if (row.rep_id !== rep.id) continue
    allocationByPlan.set(row.plan_id, (allocationByPlan.get(row.plan_id) ?? 0) + (row.target_count ?? 0))
  }

  const progress = workdayProgress(now, policy, businessDate)
  const targetList = targets ?? []
  const accountabilityMap = new Map((accountability ?? []).map((a) => [
    `${a.revenue_identity_id}:${a.activity_type}`,
    a,
  ]))

  let totalTarget = 0
  let totalCompleted = 0

  const identities = assignmentsWithIdentity.map((a) => {
    const identityTargets = targetList.filter(
      (t) => t.revenue_identity_id === a.revenue_identity_id,
    )

    const targetViews = identityTargets.map((t) => {
      const key = `${t.revenue_identity_id}:${t.activity_type}`
      const acc = accountabilityMap.get(key)
      const completed = acc?.completed_count ?? 0
      const profileId = (identityById.get(a.revenue_identity_id)?.profile_id as string | null) ?? null
      const seats = profileId ? (seatsByProfile.get(profileId) ?? 0) : 0
      const allocation = allocationByPlan.get(t.id) ?? null
      const personal = allocation ?? (seats > 1 ? 0 : t.target_count)
      const status = acc?.status ?? computeStatus(personal, completed, progress)

      totalTarget += personal
      totalCompleted += completed

      return {
        targetId: t.id,
        activityType: t.activity_type,
        targetCount: personal,
        completedCount: completed,
        remaining: Math.max(0, personal - completed),
        status,
        accountabilityId: acc?.id ?? null,
      }
    })

    const identity = mapAssignedIdentity(a.identity)

    return {
      assignmentId: a.id,
      identity,
      role: a.role,
      targets: targetViews,
    }
  })

  const overallStatus = computeStatus(totalTarget, totalCompleted, progress)

  // The canonical day is the same object Today renders. This route keeps its
  // legacy fields so existing consumers do not break, but the authoritative
  // state now comes from `day`.
  const { loadRepDay } = await import('@/lib/rep-day/load')
  const day = await loadRepDay()

  return NextResponse.json({
    repName: rep.name,
    isWorkingDay: isWorking,
    totalTarget,
    totalCompleted,
    totalRemaining: Math.max(0, totalTarget - totalCompleted),
    overallStatus,
    assignedIdentities: identities,
    notifications: [],
    day,
  })
}

function mapAssignedIdentity(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value
  const identity = row && typeof row === 'object' ? row as Record<string, unknown> : {}
  const name = typeof identity.identity_name === 'string' && identity.identity_name.trim()
    ? identity.identity_name.trim()
    : typeof identity.identityName === 'string' && identity.identityName.trim()
      ? identity.identityName.trim()
      : 'Unnamed identity'
  return {
    identityName: name,
    title: typeof identity.title === 'string' ? identity.title : null,
    channel: typeof identity.channel === 'string' ? identity.channel : 'other',
    profileUrl: typeof identity.profile_url === 'string'
      ? identity.profile_url
      : typeof identity.profileUrl === 'string'
        ? identity.profileUrl
        : null,
  }
}
