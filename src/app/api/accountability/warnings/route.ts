import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'
import { generateWarnings } from '@/lib/relay/warning-service'
import { dayProgress } from '@/lib/relay/accountability-engine'

/**
 * Get current warnings for the authenticated rep.
 * Deterministic, deduplicated, actionable.
 */

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const identityId = req.nextUrl.searchParams.get('identityId')
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const supabase = await createServerSupabase()

  // Get rep timezone
  const { data: repRow } = await supabase
    .from('reps')
    .select('timezone')
    .eq('id', ctx.repId)
    .maybeSingle()
  const timezone = (repRow?.timezone as string) ?? 'UTC'

  const dayElapsed = dayProgress(now, timezone)

  // Get availability
  const { data: availability } = await supabase
    .from('operator_availability')
    .select('status')
    .eq('person_id', ctx.repId)
    .eq('date', today)
    .maybeSingle()
  const availabilityStatus = (availability?.status as 'working' | 'leave' | 'holiday' | 'approved_unavailable') ?? 'working'

  // Get assignments
  const { data: assignments } = await supabase
    .from('identity_assignments')
    .select('revenue_identity_id')
    .eq('rep_id', ctx.repId)
    .eq('organization_id', ctx.orgId)

  if (!assignments || assignments.length === 0) {
    const warnings = generateWarnings({
      progress: {
        qualifiedProspects: { completed: 0, target: 0, remaining: 0 },
        connections: { completed: 0, target: 0, remaining: 0 },
        firstDms: { completed: 0, target: 0, remaining: 0 },
        emails: { completed: 0, target: 0, remaining: 0 },
        followups: { completed: 0, target: 0, remaining: 0 },
        dueReplies: { completed: 0, target: 0, remaining: 0 },
        meaningfulTouches: { completed: 0, target: 0, remaining: 0 },
        logging: { completed: 0, target: 0, remaining: 0 },
      },
      contracts: [],
      dayElapsed,
      hasAssignments: false,
      isWorkingDay: true,
      availabilityStatus,
      dayCloseStatus: null,
      totalRemaining: 0,
      totalCompleted: 0,
      totalTarget: 0,
    })
    return NextResponse.json({ warnings, dayElapsed })
  }

  // Get contracts for assigned identities
  const identityIds = assignments.map((a: any) => a.revenue_identity_id)
  const { data: contracts } = await supabase
    .from('revenue_identity_contracts')
    .select('*')
    .in('revenue_identity_id', identityIds)
    .eq('status', 'active')
    .order('effective_from', { ascending: false })

  // Get allocations
  const contractIds = (contracts ?? []).map((c: any) => c.id)
  const { data: allocations } = contractIds.length > 0
    ? await supabase.from('contract_allocations').select('*').in('contract_id', contractIds)
    : { data: [] }

  // Get day closes for today
  const { data: dayCloses } = await supabase
    .from('day_closes')
    .select('*')
    .eq('person_id', ctx.repId)
    .eq('date', today)
    .in('revenue_identity_id', identityIds)

  // Build progress for the first matching contract (or aggregate)
  const targetIdentityId = identityId && identityIds.includes(identityId) ? identityId : identityIds[0]
  const targetContract = (contracts ?? []).find((c: any) => c.revenue_identity_id === targetIdentityId) ?? contracts?.[0]
  const myAlloc = (allocations ?? []).find((a: any) => a.contract_id === targetContract?.id && a.person_id === ctx.repId)
  const pct = (myAlloc?.allocation_pct ?? ((allocations ?? []).filter((a: any) => a.contract_id === targetContract?.id).length === 0 ? 100 : 0)) / 100

  const targetDayClose = (dayCloses ?? []).find((dc: any) => dc.revenue_identity_id === targetIdentityId)
  const snapshot = (targetDayClose?.completion_snapshot ?? {}) as Record<string, number>

  const qp = Math.round((targetContract?.qualified_prospects ?? 0) * pct)
  const conn = Math.round((targetContract?.connections ?? 0) * pct)
  const fd = Math.round((targetContract?.first_dms ?? 0) * pct)
  const em = Math.round((targetContract?.emails ?? 0) * pct)
  const fu = Math.round((targetContract?.followups ?? 0) * pct)

  const progress = {
    qualifiedProspects: { completed: snapshot.qualifiedProspects ?? 0, target: qp, remaining: Math.max(0, qp - (snapshot.qualifiedProspects ?? 0)) },
    connections: { completed: snapshot.connections ?? 0, target: conn, remaining: Math.max(0, conn - (snapshot.connections ?? 0)) },
    firstDms: { completed: snapshot.firstDms ?? 0, target: fd, remaining: Math.max(0, fd - (snapshot.firstDms ?? 0)) },
    emails: { completed: snapshot.emails ?? 0, target: em, remaining: Math.max(0, em - (snapshot.emails ?? 0)) },
    followups: { completed: snapshot.followups ?? 0, target: fu, remaining: Math.max(0, fu - (snapshot.followups ?? 0)) },
    dueReplies: { completed: snapshot.dueReplies ?? 0, target: targetContract?.due_replies_pct ?? 100, remaining: Math.max(0, (targetContract?.due_replies_pct ?? 100) - (snapshot.dueReplies ?? 0)) },
    meaningfulTouches: { completed: snapshot.meaningfulTouches ?? 0, target: Math.round((targetContract?.meaningful_touches ?? 0) * pct), remaining: Math.max(0, Math.round((targetContract?.meaningful_touches ?? 0) * pct) - (snapshot.meaningfulTouches ?? 0)) },
    logging: { completed: snapshot.logging ?? 0, target: targetContract?.logging_completeness_pct ?? 100, remaining: Math.max(0, (targetContract?.logging_completeness_pct ?? 100) - (snapshot.logging ?? 0)) },
  }

  const totalRemaining = progress.connections.remaining + progress.firstDms.remaining + progress.emails.remaining + progress.followups.remaining
  const totalCompleted = progress.connections.completed + progress.firstDms.completed + progress.emails.completed + progress.followups.completed
  const totalTarget = conn + fd + em + fu

  const warnings = generateWarnings({
    progress,
    contracts: contracts ?? [],
    dayElapsed,
    hasAssignments: true,
    isWorkingDay: true,
    availabilityStatus,
    dayCloseStatus: targetDayClose?.status ?? null,
    totalRemaining,
    totalCompleted,
    totalTarget,
  })

  return NextResponse.json({ warnings, dayElapsed })
}
