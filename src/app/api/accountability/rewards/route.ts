import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'
import type { RewardTier, RewardType } from '@/lib/domain/types'

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createServerSupabase()
  const { data: policies, error: policiesError } = await supabase
    .from('reward_policies')
    .select('*')
    .eq('organization_id', ctx.orgId)
    .eq('enabled', true)

  if (policiesError) return NextResponse.json({ error: policiesError.message }, { status: 500 })

  const reviewId = req.nextUrl.searchParams.get('reviewId')
  let eligibility: any[] = []

  if (reviewId) {
    const { data: elig, error: eligError } = await supabase
      .from('reward_eligibility')
      .select('*')
      .eq('monthly_review_id', reviewId)

    if (eligError) return NextResponse.json({ error: eligError.message }, { status: 500 })
    eligibility = elig ?? []
  }

  return NextResponse.json({ policies: policies ?? [], eligibility })
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!can(ctx, 'MANAGE_ACCOUNTABILITY_POLICY')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const supabase = await createServerSupabase()

  if (body.action === 'create_policy') {
    const { data, error } = await supabase
      .from('reward_policies')
      .insert({
        organization_id: ctx.orgId,
        name: body.name,
        tier: (body.tier ?? 'bronze') as RewardTier,
        criteria: body.criteria ?? {},
        reward_type: (body.rewardType ?? 'recognition_only') as RewardType,
        description: body.description ?? null,
        enabled: true,
        created_by: ctx.repId,
      })
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ policy: data }, { status: 201 })
  }

  if (body.action === 'create_eligibility') {
    const { data, error } = await supabase
      .from('reward_eligibility')
      .insert({
        monthly_review_id: body.monthlyReviewId,
        policy_id: body.policyId,
        status: 'pending',
        reason_snapshot: body.reasonSnapshot ?? {},
      })
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ eligibility: data }, { status: 201 })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

export async function PATCH(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!can(ctx, 'APPROVE_REWARDS')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const supabase = await createServerSupabase()

  const table = body.eligibilityId ? 'reward_eligibility' : 'reward_policies'
  const id = body.eligibilityId ?? body.policyId

  const { data, error } = await supabase
    .from(table)
    .update({
      ...(body.status ? { status: body.status } : {}),
      ...(body.approvedBy ? { approved_by: body.approvedBy } : {}),
      ...(body.approvedAt ? { approved_at: body.approvedAt } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      ...(body.name ? { name: body.name } : {}),
      ...(body.criteria ? { criteria: body.criteria } : {}),
      ...(body.rewardType ? { reward_type: body.rewardType } : {}),
      ...(body.description ? { description: body.description } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ result: data })
}
