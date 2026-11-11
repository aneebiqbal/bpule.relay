/**
 * Daily discovery — one saved search, bounded pages, durable run state.
 *
 * ORDER (§6): SEARCH → DEDUPE → SCORE/MATCH → QUALIFY → EMAIL REVEAL.
 *
 * Every discovered person becomes a row in the ONE staging authority
 * (`captured_prospects`). Nothing is written to `leads` — a human promotes the
 * candidate later through the same `createLead` service the manual path uses.
 */
import type { DbClient } from '@/lib/db/types'
import { getProviderAdapter, providerConfigured } from './provider-registry'
import { providerBudgetRemaining, selectivelyEnrichCandidate, spendProviderCredits } from './enrichment-service'
import { isQualified, loadCandidateSenders, rankCandidateProfiles, scoreProviderPerson } from './candidate-match'
import type { ProviderSearchPage, ProviderSearchQuery } from './providers/types'
import type { TelemetrySink } from './providers/provider-http'
import { emitAction } from '@/lib/action-ledger'

export interface RunSavedSearchInput {
  client: DbClient
  organizationId: string
  searchId: string
  businessDate: string
  actorRepId?: string | null
  now?: Date
}

interface SavedSearchRow {
  id: string
  provider: string
  name: string
  titles: string[]
  seniority: string[]
  countries: string[]
  company_size: string[]
  industries: string[]
  exclude_titles: string[]
  enabled: boolean
  pages_per_run: number
  daily_credit_budget: number
  cursor_page: number
}

interface ProviderConfigRow {
  enabled: boolean | null
  daily_credit_budget: number | null
  consecutive_failures?: number | null
}

export async function recordProviderTelemetry(record: {
  client: DbClient
  organizationId: string
  provider: string
  operation: 'SEARCH' | 'ENRICH' | 'REVEAL' | 'VERIFY' | 'FIND'
  status: string
  latencyMs: number
  credits: number
  searchRunId?: string | null
  errorCategory?: string | null
}): Promise<void> {
  await record.client.from('provider_telemetry').insert({
    organization_id: record.organizationId,
    provider: record.provider,
    operation: record.operation,
    status: record.status,
    latency_ms: record.latencyMs,
    credits: record.credits,
    search_run_id: record.searchRunId ?? null,
    error_category: record.errorCategory ?? null,
  })
}

/**
 * Run one saved search. Never throws for a provider failure — the run row
 * records the failure and Relay stays usable (§15).
 */
export async function runSavedSearch(input: RunSavedSearchInput): Promise<string> {
  const { client, organizationId, searchId, businessDate } = input

  const { data: search, error } = await client
    .from('provider_saved_searches')
    .select('id, provider, name, titles, seniority, countries, company_size, industries, exclude_titles, enabled, pages_per_run, daily_credit_budget, cursor_page')
    .eq('id', searchId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) throw error
  if (!search) throw new Error('SAVED_SEARCH_NOT_FOUND')
  const config = search as unknown as SavedSearchRow
  if (!config.enabled) throw new Error('SAVED_SEARCH_DISABLED')

  const { data: providerConfig } = await client
    .from('provider_config')
    .select('enabled, daily_credit_budget, consecutive_failures')
    .eq('organization_id', organizationId)
    .eq('provider', config.provider)
    .maybeSingle()
  const providerRow = (providerConfig ?? null) as ProviderConfigRow | null

  const telemetry: TelemetrySink = (record) => recordProviderTelemetry({ client, ...record }).catch(() => {})

  const { data: runRow, error: runError } = await client
    .from('provider_search_runs')
    .insert({
      organization_id: organizationId,
      search_id: config.id,
      provider: config.provider,
      status: 'RUNNING',
      cursor_before: config.cursor_page,
      cursor_after: config.cursor_page,
    })
    .select('id')
    .single()
  if (runError) throw runError
  const runId = runRow.id as string

  const finish = async (patch: Partial<Record<string, unknown>>) => {
    await client
      .from('provider_search_runs')
      .update({ ...patch, finished_at: new Date().toISOString() })
      .eq('id', runId)
  }

  // Upsert so health is recorded even before an admin has created the config
  // row. Only the columns in the payload are written.
  const markHealth = async (patch: Record<string, unknown>) => {
    await client
      .from('provider_config')
      .upsert(
        {
          organization_id: organizationId,
          provider: config.provider,
          last_run_at: new Date().toISOString(),
          ...patch,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id,provider' },
      )
  }

  try {
    if (providerRow?.enabled === false) {
      await finish({ status: 'FAILED', error: 'provider disabled', error_category: 'INVALID_FILTERS' })
      await markHealth({ last_error: 'provider disabled', last_error_at: new Date().toISOString() })
      return runId
    }

    // A saved-search budget above 0 overrides the org budget; 0 inherits it.
    const effectiveBudget = config.daily_credit_budget > 0
      ? config.daily_credit_budget
      : (providerRow?.daily_credit_budget ?? 0)

    const adapter = getProviderAdapter(config.provider as 'prospeo' | 'snov' | 'apollo', {
      organizationId,
      searchRunId: runId,
      telemetry,
    })

    const budget = await providerBudgetRemaining(client, organizationId, config.provider, businessDate, effectiveBudget)
    if (budget <= 0) {
      await finish({ status: 'BUDGET_EXHAUSTED', error: 'daily provider budget exhausted', error_category: 'INSUFFICIENT_CREDITS' })
      await markHealth({ last_error: 'daily provider budget exhausted', last_error_at: new Date().toISOString() })
      return runId
    }

    // The actor is only needed for sender accessibility marking; discovery
    // itself is org-wide.
    const actorRepId = input.actorRepId ?? (await firstOrgRepId(client, organizationId))
    const senders = actorRepId ? await loadCandidateSenders(client, organizationId, actorRepId) : []
    // `rankSendersForLead` returns PROFILE ids. `captured_prospects.revenue_identity_id`
    // is an FK to revenue_identities(id), so the profile id must be resolved to
    // the identity built on it — storing the profile id would violate the FK.
    const identityByProfile = await activeIdentityByProfile(client, organizationId)

    const query: ProviderSearchQuery = {
      titles: config.titles ?? [],
      seniority: config.seniority ?? [],
      countries: config.countries ?? [],
      companySize: config.company_size ?? [],
      industries: config.industries ?? [],
      excludeTitles: config.exclude_titles ?? [],
      page: config.cursor_page,
      perPage: 25,
    }

    let page = config.cursor_page
    let discovered = 0
    let duplicates = 0
    let qualified = 0
    let revealed = 0
    let credits = 0
    let hasMore = true

    const existing = await existingProviderPersonIds(client, organizationId, config.provider)

    const maxPages = Math.min(Math.max(config.pages_per_run, 1), 10)
    for (let index = 0; index < maxPages && hasMore; index += 1) {
      const remaining = await providerBudgetRemaining(client, organizationId, config.provider, businessDate, effectiveBudget)
      if (remaining <= 0) break

      query.page = page
      const result: ProviderSearchPage = await adapter.search(query)
      credits += result.creditsUsed
      await spendProviderCredits(client, organizationId, config.provider, businessDate, result.creditsUsed)

      const seenInBatch = new Set<string>()
      for (const person of result.people) {
        discovered += 1
        const key = person.providerPersonId
        if (existing.has(key) || seenInBatch.has(key)) {
          duplicates += 1
          continue
        }
        seenInBatch.add(key)
        existing.add(key)

        const score = scoreProviderPerson(person, config)
        const isCandidate = isQualified(score)
        const match = rankCandidateProfiles(person, config, senders)

        // `ignoreDuplicates` is ON CONFLICT DO NOTHING (no target): the
        // candidate unique index is PARTIAL, so a targeted conflict cannot be
        // inferred. Overlapping saved searches (Europe + DevOps) must not fail.
        const { data: inserted, error: insertError } = await client
          .from('captured_prospects')
          .upsert(
            {
              organization_id: organizationId,
              owner_rep_id: null,
              raw_input: `${config.provider}:${person.providerPersonId}`,
              extracted_name: person.displayName,
              extracted_company: person.company,
              extracted_title: person.title,
              extracted_location: [person.city, person.country].filter(Boolean).join(', '),
              linkedin_url: person.linkedinUrl,
              canonical_score: score.score,
              canonical_intelligence: {
                provider: config.provider,
                person,
                match,
                reasons: score.reasons,
              },
              score_breakdown: { score: score.score, qualification: score.qualification, reasons: score.reasons },
              revenue_identity_id: match.best?.profileId
                ? (identityByProfile.get(match.best.profileId) ?? null)
                : null,
              sender_profile_id: match.best?.profileId ?? null,
              status: 'captured',
              provider: config.provider,
              provider_person_id: person.providerPersonId,
              provider_url: person.linkedinUrl,
              search_id: config.id,
              qualified: isCandidate,
              discovered_at: new Date().toISOString(),
            },
            { ignoreDuplicates: true },
          )
          .select('id')
        if (insertError) throw insertError

        const candidateId = (inserted?.[0]?.id as string | undefined) ?? null
        if (!candidateId) {
          // A second enabled search already discovered this provider person.
          duplicates += 1
          continue
        }

        await emitAction({
          client,
          orgId: organizationId,
          actionType: 'PROSPECT_DISCOVERED',
          actorType: 'system',
          actorId: input.actorRepId ?? null,
          executionStatus: 'generated',
          channel: 'linkedin',
          metadata: { provider: config.provider, person: person.displayName, company: person.company, candidateId },
          idempotencyKey: `prospect:discovered:${person.providerPersonId}`,
        })

        if (!isCandidate) continue
        qualified += 1

        const enrichment = await selectivelyEnrichCandidate({
          client,
          organizationId,
          candidateId,
          searchRunId: runId,
          budgetOverride: effectiveBudget,
          primary: adapter.name === 'prospeo' ? adapter : undefined,
          // Building the fallback would throw when Snov is not configured, so it
          // is only constructed when it can actually be used.
          fallback: adapter.name === 'prospeo' && providerConfigured('snov')
            ? snovAdapter(client, organizationId, runId, telemetry)
            : undefined,
          telemetry,
        })
        credits += enrichment.creditsUsed
        if (enrichment.outcome === 'ENRICHED') revealed += 1

        await emitAction({
          client,
          orgId: organizationId,
          actionType: 'PROSPECT_QUALIFIED',
          actorType: 'system',
          actorId: input.actorRepId ?? null,
          executionStatus: 'generated',
          channel: 'linkedin',
          metadata: { provider: config.provider, person: person.displayName, company: person.company, match: match.best ?? null },
          idempotencyKey: `prospect:qualified:${person.providerPersonId}`,
        })
      }

      hasMore = result.hasMore && result.people.length > 0
      page += 1
    }

    await client
      .from('provider_saved_searches')
      .update({ cursor_page: hasMore ? page : 1, last_run_at: new Date().toISOString() })
      .eq('id', config.id)
    await finish({
      status: 'COMPLETED',
      cursor_after: hasMore ? page : 1,
      pages_fetched: page - config.cursor_page,
      candidates_discovered: discovered,
      duplicates_skipped: duplicates,
      qualified,
      emails_revealed: revealed,
      credits_used: credits,
    })
    await markHealth({ last_success_at: new Date().toISOString(), last_error: null, consecutive_failures: 0 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const category = errorCategory(error)
    await finish({
      status: category === 'RATE_LIMITED' ? 'RATE_LIMITED' : 'FAILED',
      error: message.slice(0, 500),
      error_category: category,
    })
    const failures = (providerRow?.consecutive_failures ?? 0) + 1
    await markHealth({
      last_error: message.slice(0, 500),
      last_error_at: new Date().toISOString(),
      consecutive_failures: failures,
    })
  }

  return runId
}

function errorCategory(error: unknown): string | null {
  if (error && typeof error === 'object' && 'category' in error) {
    return String((error as { category: string }).category)
  }
  return null
}

async function firstOrgRepId(client: DbClient, organizationId: string): Promise<string | null> {
  const { data } = await client
    .from('reps')
    .select('id')
    .eq('organization_id', organizationId)
    .limit(1)
  return (data?.[0]?.id as string | undefined) ?? null
}

/** Active revenue identity per profile. A profile may have several; the first wins. */
async function activeIdentityByProfile(client: DbClient, organizationId: string): Promise<Map<string, string>> {
  const { data } = await client
    .from('revenue_identities')
    .select('id, profile_id')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .limit(500)
  const map = new Map<string, string>()
  for (const row of (data ?? []) as Array<{ id: string; profile_id: string | null }>) {
    if (row.profile_id && !map.has(row.profile_id)) map.set(row.profile_id, row.id)
  }
  return map
}

async function existingProviderPersonIds(client: DbClient, organizationId: string, provider: string): Promise<Set<string>> {
  const { data } = await client
    .from('captured_prospects')
    .select('provider_person_id')
    .eq('organization_id', organizationId)
    .eq('provider', provider)
    .limit(5000)
  return new Set((data ?? []).map((row) => row.provider_person_id as string).filter(Boolean))
}

function snovAdapter(
  _client: DbClient,
  organizationId: string,
  runId: string,
  telemetry: TelemetrySink,
) {
  return getProviderAdapter('snov', { organizationId, searchRunId: runId, telemetry })
}
