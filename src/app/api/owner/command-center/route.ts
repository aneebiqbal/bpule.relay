import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!can(ctx, 'VIEW_TEAM_ANALYTICS')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createServerSupabase()
  const today = new Date().toISOString().slice(0, 10)
  const month = today.slice(0, 7) + '-01'

  const { data: allReps } = await supabase
    .from('reps')
    .select('id, name')
    .eq('organization_id', ctx.orgId)

  const { data: contracts } = await supabase
    .from('revenue_identity_contracts')
    .select('*')
    .eq('status', 'active')

  const { data: dayCloses } = await supabase
    .from('day_closes')
    .select('*')
    .eq('date', today)

  const { data: monthReviews } = await supabase
    .from('monthly_accountability_reviews')
    .select('*')
    .eq('organization_id', ctx.orgId)
    .eq('month', month)

  const { data: exceptions } = await supabase
    .from('day_closes')
    .select('*')
    .eq('organization_id', ctx.orgId)
    .eq('status', 'completed_with_exception')
    .eq('date', today)

  const { data: rewardEligibility } = await supabase
    .from('reward_eligibility')
    .select('*')
    .eq('status', 'pending')

  const completeCount = dayCloses?.filter((dc: any) => dc.status === 'completed').length ?? 0
  const onTrackCount = dayCloses?.filter((dc: any) => dc.status === 'in_progress' || dc.status === 'ready_to_close').length ?? 0
  const needsAttentionCount = dayCloses?.filter((dc: any) => dc.status === 'missed').length ?? 0

  return NextResponse.json({
    date: today,
    isWorkingDay: true,
    totalOperators: allReps?.length ?? 0,
    completeOperators: completeCount,
    onTrackOperators: onTrackCount,
    needsAttentionOperators: needsAttentionCount,
    remainingOutboundWork: 0,
    repliesDue: 0,
    monthExpectedWorkingDays: 20,
    monthActualCompletedDays: monthReviews?.length ?? 0,
    monthMeaningfulOutbound: 0,
    monthQualifiedConversations: 0,
    monthCalls: 0,
    monthProposals: 0,
    monthWins: 0,
    monthWonRevenue: 0,
    reviewQueue: monthReviews ?? [],
    exceptionQueue: exceptions ?? [],
    rewardQueue: rewardEligibility ?? [],
    teamBreakdown: [],
  })
}
