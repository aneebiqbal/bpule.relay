import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const month = req.nextUrl.searchParams.get('month') ?? new Date().toISOString().slice(0, 7) + '-01'
  const personId = req.nextUrl.searchParams.get('personId')
  const identityId = req.nextUrl.searchParams.get('identityId')
  const supabase = await createServerSupabase()

  let query = supabase
    .from('monthly_accountability_reviews')
    .select('*')
    .eq('organization_id', ctx.orgId)
    .eq('month', month)

  if (personId) query = query.eq('person_id', personId)
  if (identityId) query = query.eq('revenue_identity_id', identityId)

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ reviews: data ?? [] })
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!can(ctx, 'MANAGE_ACCOUNTABILITY_POLICY')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const supabase = await createServerSupabase()

  const month = body.month ?? new Date().toISOString().slice(0, 7) + '-01'

  const { data: existing } = await supabase
    .from('monthly_accountability_reviews')
    .select('id')
    .eq('person_id', body.personId)
    .eq('revenue_identity_id', body.revenueIdentityId)
    .eq('month', month)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ review: existing, message: 'Review already exists' })
  }

  const { data, error } = await supabase
    .from('monthly_accountability_reviews')
    .insert({
      organization_id: ctx.orgId,
      person_id: body.personId,
      revenue_identity_id: body.revenueIdentityId,
      contract_id: body.contractId ?? null,
      month,
      execution_snapshot: body.executionSnapshot ?? {},
      quality_snapshot: body.qualitySnapshot ?? {},
      outcome_snapshot: body.outcomeSnapshot ?? {},
      consistency_snapshot: body.consistencySnapshot ?? {},
      review_status: 'pending',
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ review: data }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!can(ctx, 'MANAGE_ACCOUNTABILITY_POLICY')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const supabase = await createServerSupabase()

  const { data, error } = await supabase
    .from('monthly_accountability_reviews')
    .update({
      review_status: body.reviewStatus,
      manager_note: body.managerNote,
      admin_note: body.adminNote,
      updated_at: new Date().toISOString(),
    })
    .eq('id', body.id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ review: data })
}
