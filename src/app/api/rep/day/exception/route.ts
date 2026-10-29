import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { loadRepDay } from '@/lib/rep-day/load'
import { requestRepDayException, reviewRepDayException } from '@/lib/rep-day/persist'

export const dynamic = 'force-dynamic'

const REASONS = new Set([
  'leave',
  'meeting_heavy_day',
  'training',
  'client_call',
  'admin_override',
  'technical_outage',
  'other',
])

/** A rep requests an exception for today. */
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const reason = typeof body.reason === 'string' ? body.reason : ''
  if (!REASONS.has(reason)) {
    return NextResponse.json({ error: 'A valid exception reason is required.' }, { status: 400 })
  }

  const view = await loadRepDay()
  const result = await requestRepDayException({
    organizationId: ctx.orgId,
    repId: ctx.repId,
    businessDate: view.businessDate,
    reason,
    note: typeof body.note === 'string' ? body.note : null,
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 })
  return NextResponse.json({ ok: true, day: await loadRepDay() })
}

/** An admin or owner reviews a rep's exception. */
export async function PATCH(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ctx.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const repId = typeof body.repId === 'string' ? body.repId : ''
  const businessDate = typeof body.businessDate === 'string' ? body.businessDate : ''
  if (!repId || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    return NextResponse.json({ error: 'repId and businessDate are required.' }, { status: 400 })
  }

  // Never trust a client-supplied rep id across organizations.
  const { createServerSupabase } = await import('@/lib/supabase/server')
  const supabase = await createServerSupabase()
  const { data: member } = await supabase
    .from('reps')
    .select('id')
    .eq('id', repId)
    .eq('organization_id', ctx.orgId)
    .maybeSingle()
  if (!member) return NextResponse.json({ error: 'Rep not found in your organization.' }, { status: 404 })

  const result = await reviewRepDayException({
    organizationId: ctx.orgId,
    repId,
    businessDate,
    approved: body.approved === true,
    reviewerId: ctx.repId,
    reason: typeof body.reason === 'string' ? body.reason : null,
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 })
  return NextResponse.json({ ok: true })
}
