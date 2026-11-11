import { NextResponse } from 'next/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const authCtx = await getAuthContext()
  if (!authCtx) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  if (!can(authCtx, 'MANAGE_ORG_SETTINGS') && !authCtx.isAdmin && !authCtx.isOwner) {
    return { error: NextResponse.json({ error: 'Not authorized.' }, { status: 403 }) }
  }
  return { authCtx }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error
  const { id } = await params

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  if (typeof body.name === 'string') patch.name = body.name.trim()
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled
  if (typeof body.pagesPerRun === 'number') patch.pages_per_run = Math.max(1, Math.min(10, Math.round(body.pagesPerRun)))
  if (typeof body.dailyCreditBudget === 'number') patch.daily_credit_budget = Math.max(0, Math.round(body.dailyCreditBudget))
  for (const [key, column] of [
    ['titles', 'titles'],
    ['seniority', 'seniority'],
    ['countries', 'countries'],
    ['companySize', 'company_size'],
    ['industries', 'industries'],
    ['excludeTitles', 'exclude_titles'],
  ] as const) {
    if (Array.isArray(body[key])) patch[column] = body[key].map(String)
  }

  const client = await createServerSupabase()
  const { data, error } = await client
    .from('provider_saved_searches')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', auth.authCtx.orgId)
    .select('*')
    .maybeSingle()
  if (error) throw error
  if (!data) return NextResponse.json({ error: 'Saved search not found.' }, { status: 404 })
  return NextResponse.json({ search: data })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error
  const { id } = await params

  const client = await createServerSupabase()
  const { error } = await client
    .from('provider_saved_searches')
    .delete()
    .eq('id', id)
    .eq('organization_id', auth.authCtx.orgId)
  if (error) throw error
  return NextResponse.json({ ok: true })
}
