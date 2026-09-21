import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'
import { dayProgress } from '@/lib/relay/accountability-engine'

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!can(ctx, 'VIEW_TEAM_WORK')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const date = req.nextUrl.searchParams.get('date') ?? new Date().toISOString().slice(0, 10)
  const supabase = await createServerSupabase()

  const { data: teamMembers } = await supabase
    .from('team_memberships')
    .select('person_id, teams!inner(name)')
    .eq('team_id', ctx.managedTeamIds[0])
    .eq('active', true)

  const personIds = teamMembers?.map((m: any) => m.person_id) ?? []

  const { data: reps } = await supabase
    .from('reps')
    .select('id, name')
    .in('id', personIds)

  const { data: assignments } = await supabase
    .from('identity_assignments')
    .select('*')
    .in('rep_id', personIds)

  const { data: contracts } = await supabase
    .from('revenue_identity_contracts')
    .select('*')
    .eq('status', 'active')
    .in('revenue_identity_id', assignments?.map((a: any) => a.revenue_identity_id) ?? [])

  const { data: allocations } = await supabase
    .from('contract_allocations')
    .select('*')
    .in('contract_id', contracts?.map((c: any) => c.id) ?? [])

  const { data: dayCloses } = await supabase
    .from('day_closes')
    .select('*')
    .in('person_id', personIds)
    .eq('date', date)

  const { data: identities } = await supabase
    .from('revenue_identities')
    .select('id, identity_name')
    .in('id', assignments?.map((a: any) => a.revenue_identity_id) ?? [])

  const timeProgress = dayProgress(new Date(), 'UTC')

  const members = personIds.map((personId: string) => {
    const rep = reps?.find((r: any) => r.id === personId)
    const personAssignments = assignments?.filter((a: any) => a.rep_id === personId) ?? []
    const personContracts = contracts?.filter((c: any) =>
      personAssignments.some((a: any) => a.revenue_identity_id === c.revenue_identity_id)
    ) ?? []
    const personAllocations = allocations?.filter((a: any) => a.person_id === personId) ?? []
    const personDayCloses = dayCloses?.filter((dc: any) => dc.person_id === personId) ?? []

    let totalTarget = 0
    let totalCompleted = 0

    for (const contract of personContracts) {
      const alloc = personAllocations.find((a: any) => a.contract_id === contract.id)
      const pct = (alloc?.allocation_pct ?? 100) / 100
      const target = Math.round((contract.qualified_prospects + contract.connections + contract.first_dms + contract.emails + contract.followups + contract.meaningful_touches) * pct)
      totalTarget += target

      const dc = personDayCloses.find((dc: any) => dc.revenue_identity_id === contract.revenue_identity_id)
      const snapshot = (dc?.completion_snapshot ?? {}) as Record<string, number>
      totalCompleted += (snapshot.qualifiedProspects ?? 0) + (snapshot.connections ?? 0) + (snapshot.firstDms ?? 0) + (snapshot.emails ?? 0) + (snapshot.followups ?? 0) + (snapshot.meaningfulTouches ?? 0)
    }

    const ratio = totalTarget > 0 ? totalCompleted / totalTarget : 0
    let status: 'on_track' | 'at_risk' | 'completed' | 'missed' = 'on_track'
    if (totalCompleted >= totalTarget && totalTarget > 0) status = 'completed'
    else if (timeProgress > 0.3 && ratio < timeProgress - 0.25) status = 'at_risk'

    const identityNames = personAssignments.map((a: any) => identities?.find((i: any) => i.id === a.revenue_identity_id)?.identity_name ?? '').join(', ')

    return {
      personId,
      personName: rep?.name ?? personId,
      identityName: identityNames,
      totalCompleted,
      totalTarget,
      totalRemaining: Math.max(0, totalTarget - totalCompleted),
      status,
      dayCloseStatus: personDayCloses[0]?.status ?? null,
      exceptionReason: personDayCloses[0]?.exception_reason ?? null,
    }
  })

  const exceptions = dayCloses?.filter((dc: any) =>
    dc.status === 'completed_with_exception' || dc.exception_reason
  ) ?? []

  const needsAttention = members
    .filter((m: any) => m.status === 'at_risk')
    .map((m: any) => ({
      personId: m.personId,
      personName: m.personName,
      message: `${m.totalCompleted}/${m.totalTarget} completed with day ${Math.round(timeProgress * 100)}% elapsed`,
      severity: 'warning' as const,
    }))

  return NextResponse.json({
    date,
    isWorkingDay: true,
    members,
    exceptions,
    needsAttention,
  })
}
