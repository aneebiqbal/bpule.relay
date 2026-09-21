import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'
import type { DayCloseStatus, ExceptionReason } from '@/lib/domain/types'

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const identityId = req.nextUrl.searchParams.get('identityId')
  const date = req.nextUrl.searchParams.get('date') ?? new Date().toISOString().slice(0, 10)
  const supabase = await createServerSupabase()

  if (identityId) {
    const { data, error } = await supabase
      .from('day_closes')
      .select('*')
      .eq('person_id', ctx.repId)
      .eq('revenue_identity_id', identityId)
      .eq('date', date)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ dayClose: data })
  }

  const { data, error } = await supabase
    .from('day_closes')
    .select('*')
    .eq('person_id', ctx.repId)
    .eq('date', date)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ dayCloses: data ?? [] })
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const supabase = await createServerSupabase()

  const date = body.date ?? new Date().toISOString().slice(0, 10)

  const { data: existing } = await supabase
    .from('day_closes')
    .select('*')
    .eq('person_id', body.personId ?? ctx.repId)
    .eq('revenue_identity_id', body.revenueIdentityId)
    .eq('date', date)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ dayClose: existing })
  }

  const { data, error } = await supabase
    .from('day_closes')
    .insert({
      organization_id: ctx.orgId,
      person_id: body.personId ?? ctx.repId,
      revenue_identity_id: body.revenueIdentityId,
      contract_id: body.contractId ?? null,
      date,
      status: (body.status ?? 'not_started') as DayCloseStatus,
      completion_snapshot: body.completionSnapshot ?? {},
      exception_reason: (body.exceptionReason ?? null) as ExceptionReason | null,
      exception_note: body.exceptionNote ?? null,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ dayClose: data }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const supabase = await createServerSupabase()

  const { data, error } = await supabase
    .from('day_closes')
    .update({
      status: body.status,
      completion_snapshot: body.completionSnapshot,
      exception_reason: body.exceptionReason,
      exception_note: body.exceptionNote,
      reviewed_by: body.reviewedBy,
      reviewed_at: body.reviewedAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', body.id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ dayClose: data })
}
