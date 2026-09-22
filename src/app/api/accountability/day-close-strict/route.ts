import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'
import { can } from '@/lib/auth/organization'
import type { ExceptionReason } from '@/lib/domain/types'

/**
 * Strict Day Close API.
 *
 * Server-authoritative. Never trusts the browser's progress calculation.
 * All eligibility logic lives in day-close-service.ts.
 */

// ── GET: Day close eligibility + current state ──────────────────────────────

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const identityId = req.nextUrl.searchParams.get('identityId')
  const date = req.nextUrl.searchParams.get('date') ?? new Date().toISOString().slice(0, 10)
  const supabase = await createServerSupabase()

  if (identityId) {
    const { data: dayClose } = await supabase
      .from('day_closes')
      .select('*')
      .eq('person_id', ctx.repId)
      .eq('revenue_identity_id', identityId)
      .eq('date', date)
      .maybeSingle()

    return NextResponse.json({ dayClose })
  }

  // Return all day closes for today
  const { data: dayCloses } = await supabase
    .from('day_closes')
    .select('*')
    .eq('person_id', ctx.repId)
    .eq('date', date)

  return NextResponse.json({ dayCloses: dayCloses ?? [] })
}

// ── POST: Close the day (strict eligibility check) ──────────────────────────

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const identityId = typeof body.identityId === 'string' ? body.identityId : ''
  const date = typeof body.date === 'string' ? body.date : new Date().toISOString().slice(0, 10)

  if (!identityId) {
    return NextResponse.json({ error: 'identityId is required.' }, { status: 400 })
  }

  const supabase = await createServerSupabase()

  // Get existing day close
  const { data: existing } = await supabase
    .from('day_closes')
    .select('*')
    .eq('person_id', ctx.repId)
    .eq('revenue_identity_id', identityId)
    .eq('date', date)
    .maybeSingle()

  // Already closed → idempotent
  if (existing && (existing.status === 'completed' || existing.status === 'completed_with_exception' || existing.status === 'missed')) {
    return NextResponse.json({ dayClose: existing, message: 'Day already closed.' })
  }

  // Get contract for this identity
  const { data: contract } = await supabase
    .from('revenue_identity_contracts')
    .select('*')
    .eq('revenue_identity_id', identityId)
    .eq('status', 'active')
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Get allocations
  const { data: allocations } = contract
    ? await supabase.from('contract_allocations').select('*').eq('contract_id', contract.id)
    : { data: [] }

  const myAlloc = (allocations ?? []).find((a: any) => a.person_id === ctx.repId)
  const pct = (myAlloc?.allocation_pct ?? ((allocations ?? []).length === 0 ? 100 : 0)) / 100

  // Build progress from snapshot or compute target
  const snapshot = (existing?.completion_snapshot ?? {}) as Record<string, number>
  const qp = Math.round((contract?.qualified_prospects ?? 0) * pct)
  const conn = Math.round((contract?.connections ?? 0) * pct)
  const fd = Math.round((contract?.first_dms ?? 0) * pct)
  const em = Math.round((contract?.emails ?? 0) * pct)
  const fu = Math.round((contract?.followups ?? 0) * pct)

  const progress = {
    qualifiedProspects: { completed: snapshot.qualifiedProspects ?? 0, target: qp, remaining: Math.max(0, qp - (snapshot.qualifiedProspects ?? 0)) },
    connections: { completed: snapshot.connections ?? 0, target: conn, remaining: Math.max(0, conn - (snapshot.connections ?? 0)) },
    firstDms: { completed: snapshot.firstDms ?? 0, target: fd, remaining: Math.max(0, fd - (snapshot.firstDms ?? 0)) },
    emails: { completed: snapshot.emails ?? 0, target: em, remaining: Math.max(0, em - (snapshot.emails ?? 0)) },
    followups: { completed: snapshot.followups ?? 0, target: fu, remaining: Math.max(0, fu - (snapshot.followups ?? 0)) },
    dueReplies: { completed: snapshot.dueReplies ?? 0, target: contract?.due_replies_pct ?? 100, remaining: Math.max(0, (contract?.due_replies_pct ?? 100) - (snapshot.dueReplies ?? 0)) },
    meaningfulTouches: { completed: snapshot.meaningfulTouches ?? 0, target: Math.round((contract?.meaningful_touches ?? 0) * pct), remaining: Math.max(0, Math.round((contract?.meaningful_touches ?? 0) * pct) - (snapshot.meaningfulTouches ?? 0)) },
    logging: { completed: snapshot.logging ?? 0, target: contract?.logging_completeness_pct ?? 100, remaining: Math.max(0, (contract?.logging_completeness_pct ?? 100) - (snapshot.logging ?? 0)) },
  }

  // Evaluate eligibility server-side
  const totalRemaining =
    progress.connections.remaining +
    progress.firstDms.remaining +
    progress.emails.remaining +
    progress.followups.remaining

  const exceptionApproved = existing?.status === 'completed_with_exception'

  if (totalRemaining > 0 && !exceptionApproved) {
    // BLOCKED — build helpful error with remaining categories
    const remainingCategories: Record<string, number> = {}
    if (progress.connections.remaining > 0) remainingCategories.connections = progress.connections.remaining
    if (progress.firstDms.remaining > 0) remainingCategories.firstDms = progress.firstDms.remaining
    if (progress.emails.remaining > 0) remainingCategories.emails = progress.emails.remaining
    if (progress.followups.remaining > 0) remainingCategories.followups = progress.followups.remaining

    return NextResponse.json({
      eligible: false,
      message: 'Day Close is blocked. Complete the remaining actions before closing.',
      remaining: remainingCategories,
      totalRemaining,
    }, { status: 422 })
  }

  // ELIGIBLE — close the day
  const finalStatus = exceptionApproved ? 'completed_with_exception' : 'completed'
  const newSnapshot = {
    qualifiedProspects: progress.qualifiedProspects.completed,
    connections: progress.connections.completed,
    firstDms: progress.firstDms.completed,
    emails: progress.emails.completed,
    followups: progress.followups.completed,
    dueReplies: progress.dueReplies.completed,
    meaningfulTouches: progress.meaningfulTouches.completed,
    logging: progress.logging.completed,
  }

  let result
  if (existing) {
    const { data, error } = await supabase
      .from('day_closes')
      .update({
        status: finalStatus,
        completion_snapshot: newSnapshot,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('*')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    result = data
  } else {
    const { data, error } = await supabase
      .from('day_closes')
      .insert({
        organization_id: ctx.orgId,
        person_id: ctx.repId,
        revenue_identity_id: identityId,
        contract_id: contract?.id ?? null,
        date,
        status: finalStatus,
        completion_snapshot: newSnapshot,
      })
      .select('*')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    result = data
  }

  return NextResponse.json({
    eligible: true,
    dayClose: result,
    message: exceptionApproved ? 'Day complete with exception.' : 'Day complete.',
  })
}

// ── PATCH: Request or review exception ──────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const action = body.action as string
  const supabase = await createServerSupabase()

  if (action === 'request_exception') {
    // Rep requests an exception
    const identityId = body.identityId as string
    const reason = body.reason as ExceptionReason
    const note = body.note as string | undefined
    const date = body.date ?? new Date().toISOString().slice(0, 10)

    if (!identityId || !reason) {
      return NextResponse.json({ error: 'identityId and reason are required.' }, { status: 400 })
    }

    const { data: existing } = await supabase
      .from('day_closes')
      .select('*')
      .eq('person_id', ctx.repId)
      .eq('revenue_identity_id', identityId)
      .eq('date', date)
      .maybeSingle()

    if (existing && (existing.status === 'completed' || existing.status === 'completed_with_exception' || existing.status === 'missed')) {
      return NextResponse.json({ error: 'Day already closed.' }, { status: 409 })
    }

    if (existing) {
      const { data, error } = await supabase
        .from('day_closes')
        .update({
          status: 'completed_with_exception',
          exception_reason: reason,
          exception_note: note ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select('*')
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ dayClose: data, message: 'Exception recorded.' })
    }

    const { data: contract } = await supabase
      .from('revenue_identity_contracts')
      .select('id')
      .eq('revenue_identity_id', identityId)
      .eq('status', 'active')
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data, error } = await supabase
      .from('day_closes')
      .insert({
        organization_id: ctx.orgId,
        person_id: ctx.repId,
        revenue_identity_id: identityId,
        contract_id: contract?.id ?? null,
        date,
        status: 'completed_with_exception',
        exception_reason: reason,
        exception_note: note ?? null,
        completion_snapshot: {},
      })
      .select('*')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ dayClose: data, message: 'Exception recorded.' })
  }

  if (action === 'review_exception') {
    // Manager/Admin reviews an exception
    if (!can(ctx, 'REVIEW_TEAM_ACCOUNTABILITY') && !can(ctx, 'MANAGE_ACCOUNTABILITY_POLICY')) {
      return NextResponse.json({ error: 'Not authorized to review exceptions.' }, { status: 403 })
    }

    const dayCloseId = body.dayCloseId as string
    const approved = body.approved as boolean

    if (!dayCloseId) {
      return NextResponse.json({ error: 'dayCloseId is required.' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('day_closes')
      .update({
        status: approved ? 'completed_with_exception' : 'missed',
        reviewed_by: ctx.repId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', dayCloseId)
      .select('*')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ dayClose: data, message: approved ? 'Exception approved.' : 'Exception denied.' })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
