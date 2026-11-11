import { NextResponse } from 'next/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const PROVIDERS = ['prospeo', 'snov', 'apollo']

async function requireAdmin() {
  const authCtx = await getAuthContext()
  if (!authCtx) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  if (!can(authCtx, 'MANAGE_TEAM_TARGETS') && !authCtx.isAdmin && !authCtx.isOwner) {
    return { error: NextResponse.json({ error: 'Not authorized.' }, { status: 403 }) }
  }
  return { authCtx }
}

/** Saved searches — the daily discovery configuration (§10, §33). */
export async function GET() {
  const auth = await requireAdmin()
  if (auth.error) return auth.error
  const client = await createServerSupabase()
  const { data, error } = await client
    .from('provider_saved_searches')
    .select('*')
    .eq('organization_id', auth.authCtx.orgId)
    .order('created_at', { ascending: true })
    .limit(200)
  if (error) throw error
  return NextResponse.json({ searches: data ?? [] })
}

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const provider = typeof body.provider === 'string' ? body.provider : 'prospeo'
  if (!name) return NextResponse.json({ error: 'name is required.' }, { status: 400 })
  if (!PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: `provider must be one of ${PROVIDERS.join(', ')}` }, { status: 400 })
  }

  const client = await createServerSupabase()
  const { data, error } = await client
    .from('provider_saved_searches')
    .insert({
      organization_id: auth.authCtx.orgId,
      name,
      provider,
      titles: Array.isArray(body.titles) ? body.titles.map(String) : [],
      seniority: Array.isArray(body.seniority) ? body.seniority.map(String) : [],
      countries: Array.isArray(body.countries) ? body.countries.map(String) : [],
      company_size: Array.isArray(body.companySize) ? body.companySize.map(String) : [],
      industries: Array.isArray(body.industries) ? body.industries.map(String) : [],
      exclude_titles: Array.isArray(body.excludeTitles) ? body.excludeTitles.map(String) : [],
      enabled: body.enabled !== false,
      pages_per_run: typeof body.pagesPerRun === 'number' ? Math.max(1, Math.min(10, Math.round(body.pagesPerRun))) : 1,
      daily_credit_budget: typeof body.dailyCreditBudget === 'number' ? Math.max(0, Math.round(body.dailyCreditBudget)) : 0,
      created_by: auth.authCtx.repId,
    })
    .select('*')
    .single()
  if (error) throw error
  return NextResponse.json({ search: data }, { status: 201 })
}
