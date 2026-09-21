import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!can(ctx, 'MANAGE_ACCOUNTABILITY_POLICY')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('accountability_templates')
    .select('*')
    .eq('organization_id', ctx.orgId)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ templates: data ?? [] })
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!can(ctx, 'MANAGE_ACCOUNTABILITY_POLICY')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const supabase = await createServerSupabase()

  const { data, error } = await supabase
    .from('accountability_templates')
    .insert({
      organization_id: ctx.orgId,
      name: body.name,
      qualified_prospects: body.qualifiedProspects ?? 0,
      connections: body.connections ?? 0,
      first_dms: body.firstDms ?? 0,
      emails: body.emails ?? 0,
      followups: body.followups ?? 0,
      due_replies_pct: body.dueRepliesPct ?? 100,
      meaningful_touches: body.meaningfulTouches ?? 0,
      logging_completeness_pct: body.loggingCompletenessPct ?? 100,
      is_default: body.isDefault ?? false,
      created_by: ctx.repId,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template: data }, { status: 201 })
}
