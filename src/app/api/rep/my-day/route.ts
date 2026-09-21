import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'
import { dayProgress } from '@/lib/relay/accountability-engine'

export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createServerSupabase()
  const today = new Date().toISOString().slice(0, 10)

  const { data: contracts } = await supabase
    .from('revenue_identity_contracts')
    .select('*')
    .eq('status', 'active')
    .in('revenue_identity_id', (
      await supabase
        .from('identity_assignments')
        .select('revenue_identity_id')
        .eq('rep_id', ctx.repId)
    ).data?.map((r: any) => r.revenue_identity_id) ?? [])

  const { data: allocations } = await supabase
    .from('contract_allocations')
    .select('*')
    .in('contract_id', contracts?.map((c: any) => c.id) ?? [])

  const { data: identities } = await supabase
    .from('revenue_identities')
    .select('*')
    .eq('organization_id', ctx.orgId)
    .in('id', contracts?.map((c: any) => c.revenue_identity_id) ?? [])

  const { data: dayCloses } = await supabase
    .from('day_closes')
    .select('*')
    .eq('person_id', ctx.repId)
    .eq('date', today)

  const { data: availability } = await supabase
    .from('operator_availability')
    .select('*')
    .eq('person_id', ctx.repId)
    .eq('date', today)
    .maybeSingle()

  const myContracts = contracts?.map((contract: any) => {
    const identity = identities?.find((i: any) => i.id === contract.revenue_identity_id)
    const myAlloc = allocations?.find((a: any) => a.contract_id === contract.id && a.person_id === ctx.repId)
    const pct = (myAlloc?.allocation_pct ?? (allocations?.filter((a: any) => a.contract_id === contract.id).length === 0 ? 100 : 0)) / 100
    const dayClose = dayCloses?.find((dc: any) => dc.revenue_identity_id === contract.revenue_identity_id)

    return {
      contract,
      identity,
      allocationPct: Math.round(pct * 100),
      qualifiedProspects: Math.round(contract.qualified_prospects * pct),
      connections: Math.round(contract.connections * pct),
      firstDms: Math.round(contract.first_dms * pct),
      emails: Math.round(contract.emails * pct),
      followups: Math.round(contract.followups * pct),
      meaningfulTouches: Math.round(contract.meaningful_touches * pct),
      dayCloseStatus: dayClose?.status ?? null,
    }
  }) ?? []

  const progress = myContracts.map((mc: any) => {
    const snapshot = (dayCloses?.find((dc: any) => dc.revenue_identity_id === mc.contract.revenue_identity_id)?.completion_snapshot ?? {}) as Record<string, number>
    return {
      revenueIdentityId: mc.contract.revenue_identity_id,
      identityName: mc.identity?.identity_name ?? '',
      qualifiedProspects: { completed: snapshot.qualifiedProspects ?? 0, target: mc.qualifiedProspects, remaining: Math.max(0, mc.qualifiedProspects - (snapshot.qualifiedProspects ?? 0)) },
      connections: { completed: snapshot.connections ?? 0, target: mc.connections, remaining: Math.max(0, mc.connections - (snapshot.connections ?? 0)) },
      firstDms: { completed: snapshot.firstDms ?? 0, target: mc.firstDms, remaining: Math.max(0, mc.firstDms - (snapshot.firstDms ?? 0)) },
      emails: { completed: snapshot.emails ?? 0, target: mc.emails, remaining: Math.max(0, mc.emails - (snapshot.emails ?? 0)) },
      followups: { completed: snapshot.followups ?? 0, target: mc.followups, remaining: Math.max(0, mc.followups - (snapshot.followups ?? 0)) },
      meaningfulTouches: { completed: snapshot.meaningfulTouches ?? 0, target: mc.meaningfulTouches, remaining: Math.max(0, mc.meaningfulTouches - (snapshot.meaningfulTouches ?? 0)) },
    }
  })

  const totalTarget = myContracts.reduce((sum: number, mc: any) => sum + mc.qualifiedProspects + mc.connections + mc.firstDms + mc.emails + mc.followups + mc.meaningfulTouches, 0)
  const totalCompleted = progress.reduce((sum: number, p: any) => sum + p.qualifiedProspects.completed + p.connections.completed + p.firstDms.completed + p.emails.completed + p.followups.completed + p.meaningfulTouches.completed, 0)

  const progressRatio = totalTarget > 0 ? totalCompleted / totalTarget : 0
  const timeProgress = dayProgress(new Date(), 'UTC')

  let overallStatus: 'on_track' | 'at_risk' | 'completed' | 'missed' = 'on_track'
  if (totalCompleted >= totalTarget && totalTarget > 0) overallStatus = 'completed'
  else if (timeProgress > 0.3 && progressRatio < timeProgress - 0.25) overallStatus = 'at_risk'

  const canClose = totalCompleted >= totalTarget && totalTarget > 0

  const nextAction = !canClose
    ? (() => {
        const p = progress.find((p: any) => p.meaningfulTouches.remaining > 0)
        return p ? `Send ${p.meaningfulTouches.remaining} more meaningful touches` : 'All targets met'
      })()
    : 'Day complete — close day'

  return NextResponse.json({
    personId: ctx.repId,
    date: today,
    isWorkingDay: availability?.status !== 'leave' && availability?.status !== 'holiday' && availability?.status !== 'approved_unavailable',
    availabilityStatus: availability?.status ?? 'working',
    contracts: myContracts,
    progress,
    totalCompleted,
    totalTarget,
    totalRemaining: Math.max(0, totalTarget - totalCompleted),
    overallStatus,
    canCloseDay: canClose,
    nextAction,
  })
}
