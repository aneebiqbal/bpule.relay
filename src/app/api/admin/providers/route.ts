import { NextResponse } from 'next/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'
import { providerConfigured } from '@/lib/enrichment/provider-registry'

export const dynamic = 'force-dynamic'

const PROVIDERS = ['prospeo', 'snov', 'apollo'] as const

/**
 * Provider status, budget and health (§33, §34).
 *
 * Reads the canonical provider tables only — never an isolated analytics
 * universe. Secrets are never returned: `configured` is a boolean derived from
 * the server environment.
 */
async function requireAdmin() {
  const authCtx = await getAuthContext()
  if (!authCtx) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  if (!can(authCtx, 'MANAGE_ORG_SETTINGS') && !authCtx.isAdmin && !authCtx.isOwner) {
    return { error: NextResponse.json({ error: 'Not authorized.' }, { status: 403 }) }
  }
  return { authCtx }
}

export async function GET() {
  const auth = await requireAdmin()
  if (auth.error) return auth.error
  const client = await createServerSupabase()
  const today = new Date().toISOString().slice(0, 10)

  const [{ data: configs }, { data: telemetry }, { data: runs }] = await Promise.all([
    client.from('provider_config').select('*').eq('organization_id', auth.authCtx.orgId).limit(20),
    client.from('provider_telemetry').select('provider, status, credits, created_at')
      .eq('organization_id', auth.authCtx.orgId).gte('created_at', `${today}T00:00:00.000Z`)
      .limit(2000),
    client.from('provider_search_runs').select('id, search_id, provider, status, started_at, candidates_discovered, qualified, emails_revealed, credits_used, error')
      .eq('organization_id', auth.authCtx.orgId).order('started_at', { ascending: false }).limit(20),
  ])

  const configByProvider = new Map((configs ?? []).map((row) => [row.provider as string, row]))
  const spendByProvider = new Map<string, { credits: number; operations: number; failures: number }>()
  for (const row of telemetry ?? []) {
    const entry = spendByProvider.get(row.provider as string) ?? { credits: 0, operations: 0, failures: 0 }
    entry.credits += Number(row.credits ?? 0)
    entry.operations += 1
    if (row.status !== 'OK') entry.failures += 1
    spendByProvider.set(row.provider as string, entry)
  }

  const providers = PROVIDERS.map((provider) => {
    const config = configByProvider.get(provider) as Record<string, unknown> | undefined
    const spend = spendByProvider.get(provider) ?? { credits: 0, operations: 0, failures: 0 }
    return {
      provider,
      configured: providerConfigured(provider),
      enabled: (config?.enabled as boolean | undefined) ?? true,
      dailyCreditBudget: (config?.daily_credit_budget as number | undefined) ?? 0,
      creditsUsedToday: (config?.credits_used_today as number | undefined) ?? 0,
      budgetDate: (config?.budget_date as string | null | undefined) ?? null,
      lastRunAt: (config?.last_run_at as string | null | undefined) ?? null,
      lastSuccessAt: (config?.last_success_at as string | null | undefined) ?? null,
      lastError: (config?.last_error as string | null | undefined) ?? null,
      lastErrorAt: (config?.last_error_at as string | null | undefined) ?? null,
      consecutiveFailures: (config?.consecutive_failures as number | undefined) ?? 0,
      today: spend,
    }
  })

  return NextResponse.json({ providers, recentRuns: runs ?? [] })
}

/** Update a provider's enabled flag and/or daily credit budget (§33). */
export async function PATCH(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const provider = typeof body.provider === 'string' ? body.provider : ''
  if (!PROVIDERS.includes(provider as (typeof PROVIDERS)[number])) {
    return NextResponse.json({ error: `provider must be one of ${PROVIDERS.join(', ')}` }, { status: 400 })
  }
  if (provider === 'apollo') {
    return NextResponse.json({ error: 'Apollo is disabled by design and cannot be configured.' }, { status: 400 })
  }
  if (typeof body.enabled !== 'boolean' && typeof body.dailyCreditBudget !== 'number') {
    return NextResponse.json({ error: 'enabled and/or dailyCreditBudget is required.' }, { status: 400 })
  }
  if (typeof body.dailyCreditBudget === 'number' && (!Number.isInteger(body.dailyCreditBudget) || body.dailyCreditBudget < 0)) {
    return NextResponse.json({ error: 'dailyCreditBudget must be a non-negative integer.' }, { status: 400 })
  }

  const client = await createServerSupabase()
  const patch: Record<string, unknown> = {
    organization_id: auth.authCtx.orgId,
    provider,
    updated_at: new Date().toISOString(),
  }
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled
  if (typeof body.dailyCreditBudget === 'number') patch.daily_credit_budget = body.dailyCreditBudget

  const { data, error } = await client
    .from('provider_config')
    .upsert(patch, { onConflict: 'organization_id,provider' })
    .select('*')
    .single()
  if (error) throw error
  return NextResponse.json({ config: data })
}
