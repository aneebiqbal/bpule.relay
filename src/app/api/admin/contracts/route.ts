import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!can(ctx, 'MANAGE_ACCOUNTABILITY_POLICY')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const identityId = req.nextUrl.searchParams.get('identityId')
  const supabase = await createServerSupabase()

  let query = supabase
    .from('revenue_identity_contracts')
    .select('*')
    .eq('revenue_identity_id', identityId ?? '')
    .order('effective_from', { ascending: false })

  if (!identityId) {
    query = supabase
      .from('revenue_identity_contracts')
      .select('*')
      .order('effective_from', { ascending: false })
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contracts: data ?? [] })
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!can(ctx, 'MANAGE_ACCOUNTABILITY_POLICY')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const supabase = await createServerSupabase()

  const { data: identity } = await supabase
    .from('revenue_identities')
    .select('id')
    .eq('id', body.revenueIdentityId)
    .eq('organization_id', ctx.orgId)
    .maybeSingle()

  if (!identity) {
    return NextResponse.json({ error: 'Revenue identity not found' }, { status: 404 })
  }

  let template = null
  if (body.templateId) {
    const { data: t } = await supabase
      .from('accountability_templates')
      .select('*')
      .eq('id', body.templateId)
      .eq('organization_id', ctx.orgId)
      .maybeSingle()
    template = t
  }

  const defaults = template ?? {
    annual_revenue_target: 100000,
    qualified_prospects: 50,
    connections: 25,
    first_dms: 30,
    emails: 30,
    followups: 25,
    due_replies_pct: 100,
    meaningful_touches: 90,
    logging_completeness_pct: 100,
  }

  const { data: existing } = await supabase
    .from('revenue_identity_contracts')
    .select('id')
    .eq('revenue_identity_id', body.revenueIdentityId)
    .eq('status', 'active')
    .maybeSingle()

  if (existing) {
    await supabase
      .from('revenue_identity_contracts')
      .update({ status: 'superseded', effective_to: body.effectiveFrom ?? new Date().toISOString().slice(0, 10) })
      .eq('id', existing.id)
  }

  const { data, error } = await supabase
    .from('revenue_identity_contracts')
    .insert({
      revenue_identity_id: body.revenueIdentityId,
      template_id: body.templateId ?? null,
      annual_revenue_target: body.annualRevenueTarget ?? defaults.annual_revenue_target,
      qualified_prospects: body.qualifiedProspects ?? defaults.qualified_prospects,
      connections: body.connections ?? defaults.connections,
      first_dms: body.firstDms ?? defaults.first_dms,
      emails: body.emails ?? defaults.emails,
      followups: body.followups ?? defaults.followups,
      due_replies_pct: body.dueRepliesPct ?? defaults.due_replies_pct,
      meaningful_touches: body.meaningfulTouches ?? defaults.meaningful_touches,
      logging_completeness_pct: body.loggingCompletenessPct ?? defaults.logging_completeness_pct,
      effective_from: body.effectiveFrom ?? new Date().toISOString().slice(0, 10),
      status: 'active',
      version: 1,
      created_by: ctx.repId,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contract: data }, { status: 201 })
}
