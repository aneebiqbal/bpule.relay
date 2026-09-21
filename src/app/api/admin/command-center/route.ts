import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import {
  computeStatus,
  dayProgress,
  isWorkingDay,
  countConsecutiveMisses,
  needsAttention,
} from '@/lib/relay/accountability-engine'
import type { AccountabilityStatus } from '@/lib/domain/types'

export async function GET() {
  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!can(authCtx, 'VIEW_TEAM_ANALYTICS')) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const supabase = await createServerSupabase()

  const { data: orgRow } = await supabase
    .from('organizations')
    .select('working_days, timezone')
    .eq('id', authCtx.orgId)
    .single()

  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const isWorking = isWorkingDay(now, (orgRow?.working_days as number[]) ?? [1, 2, 3, 4, 5])
  const progress = dayProgress(now, orgRow?.timezone ?? 'UTC')

  // Get all reps
  const { data: reps } = await supabase
    .from('reps')
    .select('id, name')
    .eq('organization_id', authCtx.orgId)

  // Get all active identities
  const { data: identities } = await supabase
    .from('revenue_identities')
    .select('id, identity_name, slug, status')
    .eq('organization_id', authCtx.orgId)
    .eq('status', 'active')

  // Get today's targets
  const { data: targets } = await supabase
    .from('daily_targets')
    .select('*')
    .eq('organization_id', authCtx.orgId)
    .eq('active', true)

  // Get today's accountability
  const { data: accountability } = await supabase
    .from('daily_accountability')
    .select('*')
    .eq('organization_id', authCtx.orgId)
    .eq('target_date', today)

  // Get last 10 working days of accountability for consecutive misses
  const { data: recentAccountability } = await supabase
    .from('daily_accountability')
    .select('rep_id, revenue_identity_id, activity_type, target_date, status')
    .eq('organization_id', authCtx.orgId)
    .order('target_date', { ascending: false })
    .limit(500)

  const targetList = targets ?? []
  const accountabilityList = accountability ?? []
  const accountabilityMap = new Map(
    accountabilityList.map((a) => [`${a.rep_id}:${a.revenue_identity_id}:${a.activity_type}`, a]),
  )

  let totalTargets = 0
  let totalCompleted = 0
  let onTrackReps = 0
  let behindReps = 0
  let completedReps = 0
  let missedReps = 0

  const attentionItems: Array<{
    repId: string
    repName: string
    identityId: string
    identityName: string
    activityType: string
    message: string
    severity: 'warning' | 'critical'
  }> = []

  // Group accountability by rep for consecutive misses
  const accountabilityByRepIdentity = new Map<string, Array<{ date: string; status: AccountabilityStatus }>>()
  for (const a of recentAccountability ?? []) {
    const key = `${a.rep_id}:${a.revenue_identity_id}:${a.activity_type}`
    if (!accountabilityByRepIdentity.has(key)) {
      accountabilityByRepIdentity.set(key, [])
    }
    accountabilityByRepIdentity.get(key)!.push({ date: a.target_date, status: a.status as AccountabilityStatus })
  }

  // Build rep summaries
  const repSummaries = (reps ?? []).map((rep) => {
    const repTargets = targetList.filter((t) => t.rep_id === rep.id)
    let repTotal = 0
    let repCompleted = 0
    let repHasTarget = false

    for (const t of repTargets) {
      const key = `${rep.id}:${t.revenue_identity_id}:${t.activity_type}`
      const acc = accountabilityMap.get(key)
      const completed = acc?.completed_count ?? 0
      const status = acc?.status ?? computeStatus(t.target_count, completed, progress)

      repTotal += t.target_count
      repCompleted += completed
      repHasTarget = true

      // Check for consecutive misses
      const hist = accountabilityByRepIdentity.get(key) ?? []
      const consecutive = countConsecutiveMisses(hist)

      const attn = needsAttention(t.target_count, completed, progress, consecutive)
      if (attn.needs) {
        const identityName = identities?.find((i) => i.id === t.revenue_identity_id)?.identity_name ?? 'Unknown'
        attentionItems.push({
          repId: rep.id,
          repName: rep.name,
          identityId: t.revenue_identity_id,
          identityName,
          activityType: t.activity_type,
          message: attn.reason ?? '',
          severity: attn.severity!,
        })
      }
    }

    totalTargets += repTotal
    totalCompleted += repCompleted

    if (repHasTarget) {
      const repStatus = computeStatus(repTotal, repCompleted, progress)
      if (repStatus === 'completed') completedReps++
      else if (repStatus === 'at_risk') behindReps++
      else if (repStatus === 'missed') missedReps++
      else onTrackReps++
    }

    return {
      repId: rep.id,
      repName: rep.name,
      totalTarget: repTotal,
      totalCompleted: repCompleted,
      remaining: Math.max(0, repTotal - repCompleted),
      status: repHasTarget ? computeStatus(repTotal, repCompleted, progress) : 'on_track' as const,
    }
  })

  return NextResponse.json({
    date: today,
    isWorkingDay: isWorking,
    totalReps: (reps ?? []).length,
    onTrackReps,
    behindReps,
    completedReps,
    missedReps,
    activeIdentities: (identities ?? []).length,
    totalTargetsToday: totalTargets,
    totalCompletedToday: totalCompleted,
    attentionItems,
    repSummaries,
  })
}
