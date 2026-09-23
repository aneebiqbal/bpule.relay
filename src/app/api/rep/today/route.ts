import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/current'
import { computeStatus, dayProgress, isWorkingDay } from '@/lib/relay/accountability-engine'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const supabase = await createServerSupabase()
  const org = user.organization
  const rep = user.rep

  // Check if today is a working day
  const now = new Date()
  const isWorking = isWorkingDay(now, org.workingDays)

  // Get assigned identities
  const { data: assignments } = await supabase
    .from('identity_assignments')
    .select(`
      id,
      revenue_identity_id,
      assigned_by,
      created_at,
      identity:revenue_identities(*)
    `)
    .eq('rep_id', rep.id)
    .eq('organization_id', org.id)

  if (!assignments || assignments.length === 0) {
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

  // Get active targets for these assignments
  const identityIds = assignments.map((a) => a.revenue_identity_id)
  const { data: targets } = await supabase
    .from('daily_targets')
    .select('*')
    .eq('rep_id', rep.id)
    .in('revenue_identity_id', identityIds)
    .eq('active', true)

  // Get today's accountability
  const today = now.toISOString().slice(0, 10)
  const { data: accountability } = await supabase
    .from('daily_accountability')
    .select('*')
    .eq('rep_id', rep.id)
    .eq('target_date', today)
    .eq('organization_id', org.id)

  const progress = dayProgress(now, rep.timezone || org.timezone)
  const targetList = targets ?? []
  const accountabilityMap = new Map((accountability ?? []).map((a) => [
    `${a.revenue_identity_id}:${a.activity_type}`,
    a,
  ]))

  let totalTarget = 0
  let totalCompleted = 0

  const identities = assignments.map((a) => {
    const identityTargets = targetList.filter(
      (t) => t.revenue_identity_id === a.revenue_identity_id,
    )

    const targetViews = identityTargets.map((t) => {
      const key = `${t.revenue_identity_id}:${t.activity_type}`
      const acc = accountabilityMap.get(key)
      const completed = acc?.completed_count ?? 0
      const status = acc?.status ?? computeStatus(t.target_count, completed, progress)

      totalTarget += t.target_count
      totalCompleted += completed

      return {
        targetId: t.id,
        activityType: t.activity_type,
        targetCount: t.target_count,
        completedCount: completed,
        remaining: Math.max(0, t.target_count - completed),
        status,
        accountabilityId: acc?.id ?? null,
      }
    })

    const identity = mapAssignedIdentity(a.identity)

    return {
      assignmentId: a.id,
      identity,
      targets: targetViews,
    }
  })

  const overallStatus = computeStatus(totalTarget, totalCompleted, progress)

  return NextResponse.json({
    repName: rep.name,
    isWorkingDay: isWorking,
    totalTarget,
    totalCompleted,
    totalRemaining: Math.max(0, totalTarget - totalCompleted),
    overallStatus,
    assignedIdentities: identities,
    notifications: [],
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
