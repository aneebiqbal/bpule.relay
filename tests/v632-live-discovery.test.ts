/**
 * V6.3.2 — LIVE discovery certification through the REAL scheduler outbox.
 *
 * Exercises operational_jobs → DISCOVER_PROSPECTS → provider search → dedupe →
 * canonical score → profile match → selective enrichment → captured_prospects.
 * Does not call runSavedSearch directly; it drives runOperationalScheduler.
 *
 * Runs only when the Prospeo key is present and the daily quota is available.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runOperationalScheduler } from '@/lib/scheduler/run'
import { neonServiceDbClient, closeNeonPool } from '@/lib/db/neon'

const ORG = '11111111-1111-1111-1111-111111111111'
const RUN = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const SEARCH_NAME = `V632 live ${RUN}`

const isLive = Boolean(process.env.PROSPEO_API_KEY)
const live = isLive ? describe : describe.skip

let client: ReturnType<typeof neonServiceDbClient>
let searchId = ''
let quotaAvailable = false

beforeAll(async () => {
  if (!isLive) return
  client = neonServiceDbClient()

  // Probe the provider's daily search quota without spending a credit when the
  // plan is exhausted (a 429 costs nothing).
  try {
    const { getProviderAdapter } = await import('@/lib/enrichment/provider-registry')
    const adapter = getProviderAdapter('prospeo', { organizationId: ORG })
    await adapter.search({
      titles: ['Founder'], seniority: [], countries: ['United Kingdom'],
      companySize: [], industries: [], excludeTitles: [], page: 1, perPage: 5,
    })
    quotaAvailable = true
  } catch (error) {
    const category = (error as { category?: string })?.category
    if (category === 'RATE_LIMITED' || category === 'INSUFFICIENT_CREDITS') {
      // eslint-disable-next-line no-console
      console.warn('[v632-live] Prospeo daily search quota exhausted — live discovery skipped until reset.')
      quotaAvailable = false
    } else {
      throw error
    }
  }
  const { data, error } = await client
    .from('provider_saved_searches')
    .insert({
      organization_id: ORG,
      name: SEARCH_NAME,
      provider: 'prospeo',
      titles: ['Founder'],
      seniority: [],
      countries: ['United Kingdom'],
      company_size: [],
      industries: [],
      exclude_titles: [],
      enabled: true,
      pages_per_run: 1,
      cursor_page: 1,
    })
    .select('id')
    .single()
  if (error) throw error
  searchId = data!.id
})

afterAll(async () => {
  if (!isLive) return
  const c = neonServiceDbClient()
  if (searchId) {
    await c.from('captured_prospects').delete().eq('organization_id', ORG).eq('search_id', searchId)
    await c.from('provider_search_runs').delete().eq('organization_id', ORG).eq('search_id', searchId)
    await c.from('provider_saved_searches').delete().eq('id', searchId)
    await c.from('operational_jobs').delete().eq('organization_id', ORG).like('dedupe_key', `%${searchId}%`)
  }
  await c.from('provider_config').delete().eq('organization_id', ORG).eq('provider', 'prospeo')
  await c.from('provider_telemetry').delete().eq('organization_id', ORG).eq('provider', 'prospeo')
  await c.from('contact_points').delete().eq('organization_id', ORG).like('person_id', 'prospeo:%')
  await closeNeonPool()
})

/** Insert a pending DISCOVER_PROSPECTS job with an old next_attempt_at so the
 * scheduler claims it first (limit: 1), without running the day jobs. */
async function enqueueDiscoveryJob(dedupeKey: string, cursorPage?: number) {
  if (cursorPage !== undefined) {
    await client.from('provider_saved_searches').update({ cursor_page: cursorPage }).eq('id', searchId)
  }
  const { error } = await client.from('operational_jobs').insert({
    organization_id: ORG,
    business_date: new Date().toISOString().slice(0, 10),
    job_kind: 'DISCOVER_PROSPECTS',
    time_bucket: searchId,
    dedupe_key: dedupeKey,
    payload: { searchId },
    state: 'pending',
    attempt: 0,
    max_attempts: 5,
    next_attempt_at: new Date(Date.now() - 60 * 60_000).toISOString(),
  })
  if (error) throw error
  return runOperationalScheduler({ organizationId: ORG, client, limit: 1, now: new Date() })
}

async function latestRun() {
  const { data } = await client
    .from('provider_search_runs')
    .select('*')
    .eq('organization_id', ORG)
    .eq('search_id', searchId)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data as Record<string, unknown> | null
}

live('V632 REAL DISCOVERY PATH', () => {
  it('runs operational_jobs → DISCOVER_PROSPECTS → candidates, with telemetry and credits', async () => {
    if (!quotaAvailable) return
    const dedupeKey = `${new Date().toISOString().slice(0, 10)}:DISCOVER_PROSPECTS:${searchId}`
    const summary = await enqueueDiscoveryJob(dedupeKey)
    expect(summary.ok).toBe(true)

    const run = await latestRun()
    expect(run).toBeTruthy()
    expect(run?.status).toBe('COMPLETED')
    const discovered = Number(run?.candidates_discovered ?? 0)
    expect(discovered).toBeGreaterThan(0)

    // §4 — telemetry + credits written by the real path.
    const { data: telemetry } = await client
      .from('provider_telemetry')
      .select('operation, status, credits')
      .eq('organization_id', ORG)
      .eq('provider', 'prospeo')
      .eq('search_run_id', run!.id)
    expect((telemetry ?? []).some((row) => row.operation === 'SEARCH' && row.status === 'OK')).toBe(true)
    const searchCredits = (telemetry ?? []).filter((row) => row.operation === 'SEARCH').reduce((sum, row) => sum + Number(row.credits), 0)
    expect(searchCredits).toBe(run?.credits_used)

    // §6 — credit saving: R <= Q <= N.
    const qualified = Number(run?.qualified ?? 0)
    const revealed = Number(run?.emails_revealed ?? 0)
    expect(revealed).toBeLessThanOrEqual(qualified)
    expect(qualified).toBeLessThanOrEqual(discovered)

    // Candidates are real source facts.
    const { data: candidates } = await client
      .from('captured_prospects')
      .select('provider_person_id, extracted_name, extracted_title, extracted_company, linkedin_url, canonical_score, qualified')
      .eq('organization_id', ORG)
      .eq('search_id', searchId)
      .limit(5)
    expect((candidates ?? []).length).toBeGreaterThan(0)
    for (const row of candidates ?? []) {
      expect(row.provider_person_id).toBeTruthy()
      expect(row.extracted_name).toBeTruthy()
      expect(row.extracted_title).toBeTruthy()
      expect(row.linkedin_url).toBeTruthy()
    }
  }, 180_000)

  it('replays the same page with 0 duplicate candidates and 0 duplicate discovery events', async () => {
    if (!quotaAvailable) return
    const { count: beforeCandidates } = await client
      .from('captured_prospects')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ORG)
      .eq('search_id', searchId)
    const { count: beforeEvents } = await client
      .from('action_events')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ORG)
      .eq('action_type', 'PROSPECT_DISCOVERED')

    const dedupeKey = `${new Date().toISOString().slice(0, 10)}:DISCOVER_PROSPECTS:${searchId}:replay`
    await enqueueDiscoveryJob(dedupeKey, 1)

    const after = await latestRun()
    expect(after?.status).toBe('COMPLETED')
    // The same page is re-ingested; every person is a duplicate.
    expect(Number(after?.duplicates_skipped ?? 0)).toBeGreaterThan(0)

    const { count: afterCandidates } = await client
      .from('captured_prospects')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ORG)
      .eq('search_id', searchId)
    const { count: afterEvents } = await client
      .from('action_events')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ORG)
      .eq('action_type', 'PROSPECT_DISCOVERED')
    expect(afterCandidates).toBe(beforeCandidates)
    expect(afterEvents).toBe(beforeEvents)
  }, 180_000)

  it('advances the cursor and does not repeat page 1 ingestion', async () => {
    if (!quotaAvailable) return
    const { data: search } = await client.from('provider_saved_searches').select('cursor_page').eq('id', searchId).single()
    const cursorBefore = Number(search?.cursor_page ?? 1)
    const dedupeKey = `${new Date().toISOString().slice(0, 10)}:DISCOVER_PROSPECTS:${searchId}:cursor`
    await enqueueDiscoveryJob(dedupeKey)

    const run = await latestRun()
    expect(run?.status).toBe('COMPLETED')
    const { data: after } = await client.from('provider_saved_searches').select('cursor_page').eq('id', searchId).single()
    const cursorAfter = Number(after?.cursor_page ?? 1)
    // Either it advanced to the next page, or the search completed and reset to 1.
    expect(cursorAfter === 1 || cursorAfter > cursorBefore || cursorAfter === cursorBefore + 1).toBe(true)
  }, 180_000)

  it('a tiny budget stops paid operations before overspend and closes cleanly', async () => {
    if (!quotaAvailable) return
    // Budget 1: the search page spends 1 credit, then enrichment must stop.
    await client.from('provider_saved_searches').update({ daily_credit_budget: 1 }).eq('id', searchId)
    await client.from('provider_config').upsert({
      organization_id: ORG,
      provider: 'prospeo',
      enabled: true,
      daily_credit_budget: 0,
      credits_used_today: 0,
      budget_date: new Date().toISOString().slice(0, 10),
    }, { onConflict: 'organization_id,provider' })

    const dedupeKey = `${new Date().toISOString().slice(0, 10)}:DISCOVER_PROSPECTS:${searchId}:budget`
    await enqueueDiscoveryJob(dedupeKey, 1)
    const run = await latestRun()
    expect(run?.status).toBe('COMPLETED')
    // The search consumed the single credit; no reveal could run.
    expect(Number(run?.credits_used ?? 0)).toBeLessThanOrEqual(1)
    expect(Number(run?.emails_revealed ?? 0)).toBe(0)

    await client.from('provider_saved_searches').update({ daily_credit_budget: 0 }).eq('id', searchId)
  }, 180_000)

  it('a successful run resets provider health (consecutive failures, last success)', async () => {
    if (!quotaAvailable) return
    const { data: config } = await client
      .from('provider_config')
      .select('last_success_at, consecutive_failures, last_error')
      .eq('organization_id', ORG)
      .eq('provider', 'prospeo')
      .maybeSingle()
    expect(config?.consecutive_failures ?? 0).toBe(0)
    expect(config?.last_success_at).toBeTruthy()
  }, 60_000)
})
