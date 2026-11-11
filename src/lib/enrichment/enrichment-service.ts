/**
 * Email enrichment orchestrator — selective, budgeted, credit-saving.
 *
 * ORDER IS LOAD-BEARING (§6):
 *
 *   SEARCH → DEDUPE → SCORE/MATCH → QUALIFY → EMAIL REVEAL
 *
 * An unqualified candidate never reaches a paid endpoint. A qualified one tries
 * Prospeo first, then Snov when Prospeo has no verified email and the candidate
 * has a company domain plus a full name. The result is persisted in the ONE
 * contact authority (`contact_points`) — never a second email table.
 */
import type { DbClient } from '@/lib/db/types'
import type { ProviderAdapter, ProviderEnrichment, ProviderPerson } from './providers/types'
import { toContactVerification } from './providers/types'
import type { TelemetrySink } from './providers/provider-http'

export type EnrichmentOutcome =
  | 'ENRICHED'
  | 'NOT_QUALIFIED'
  | 'NO_EMAIL_AVAILABLE'
  | 'BUDGET_EXHAUSTED'
  | 'PROVIDER_UNAVAILABLE'

export interface EnrichmentInput {
  client: DbClient
  organizationId: string
  candidateId: string
  searchRunId?: string | null
  /** Primary reveal provider. Defaults to prospeo. */
  primary?: ProviderAdapter
  fallback?: ProviderAdapter
  telemetry?: TelemetrySink
}

interface CandidateRow {
  id: string
  provider: string | null
  provider_person_id: string | null
  provider_url: string | null
  extracted_name: string | null
  extracted_company: string | null
  extracted_title: string | null
  linkedin_url: string | null
  qualified: boolean
  status: string
}

const STALE_DAYS_DEFAULT = 75

/** Remaining daily credit budget for a provider. 0 means unlimited. */
export async function providerBudgetRemaining(
  client: DbClient,
  organizationId: string,
  provider: string,
  businessDate: string,
): Promise<number> {
  const { data, error } = await client
    .from('provider_config')
    .select('daily_credit_budget, credits_used_today, budget_date')
    .eq('organization_id', organizationId)
    .eq('provider', provider)
    .maybeSingle()
  if (error) throw error
  if (!data) return Number.POSITIVE_INFINITY
  const budget = (data.daily_credit_budget as number) ?? 0
  if (budget <= 0) return Number.POSITIVE_INFINITY
  const budgetDate = data.budget_date ? String(data.budget_date).slice(0, 10) : null
  const used = budgetDate === businessDate ? ((data.credits_used_today as number) ?? 0) : 0
  return Math.max(0, budget - used)
}

export async function spendProviderCredits(
  client: DbClient,
  organizationId: string,
  provider: string,
  businessDate: string,
  credits: number,
): Promise<void> {
  if (credits <= 0) return
  const { data, error } = await client
    .from('provider_config')
    .select('credits_used_today, budget_date, daily_credit_budget')
    .eq('organization_id', organizationId)
    .eq('provider', provider)
    .maybeSingle()
  if (error) throw error
  if (!data) return
  const budgetDate = data.budget_date ? String(data.budget_date).slice(0, 10) : null
  const usedToday = budgetDate === businessDate ? ((data.credits_used_today as number) ?? 0) : 0
  await client
    .from('provider_config')
    .update({
      credits_used_today: usedToday + credits,
      budget_date: businessDate,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', organizationId)
    .eq('provider', provider)
}

/**
 * Persist the enriched email on the candidate. The candidate has no lead yet, so
 * the contact row is keyed by the provider person and `lead_id` stays NULL until
 * promotion links it.
 */
async function persistCandidateEmail(
  client: DbClient,
  input: EnrichmentInput,
  candidate: CandidateRow,
  enrichment: ProviderEnrichment,
  providerName: string,
): Promise<void> {
  if (!enrichment.email) return
  const now = new Date().toISOString()
  await client
    .from('contact_points')
    .upsert(
      {
        organization_id: input.organizationId,
        lead_id: null,
        person_id: candidate.provider_person_id,
        type: 'email',
        value: enrichment.email,
        source: 'CONNECTED_PROVIDER',
        source_type: providerName,
        verification_status: toContactVerification(enrichment.verification),
        verification_method: providerName,
        confidence: enrichment.verification === 'VERIFIED' ? 1 : 0.6,
        is_primary: true,
        is_business_contact: true,
        discovered_at: now,
        verified_at: enrichment.verification === 'VERIFIED' ? now : null,
        updated_at: now,
      },
      { onConflict: 'organization_id,person_id,type,value_key' },
    )
}

export async function selectivelyEnrichCandidate(input: EnrichmentInput): Promise<EnrichmentOutcome> {
  const { client, organizationId, candidateId } = input

  const { data, error } = await client
    .from('captured_prospects')
    .select('id, provider, provider_person_id, provider_url, extracted_name, extracted_company, extracted_title, linkedin_url, qualified, status')
    .eq('id', candidateId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('CANDIDATE_NOT_FOUND')
  const candidate = data as unknown as CandidateRow

  // §6 / §43: an unqualified candidate spends nothing.
  if (!candidate.qualified || candidate.status === 'discarded') return 'NOT_QUALIFIED'

  const person: ProviderPerson = {
    providerPersonId: candidate.provider_person_id ?? candidate.id,
    displayName: candidate.extracted_name ?? '',
    firstName: null,
    lastName: null,
    title: candidate.extracted_title ?? '',
    company: candidate.extracted_company ?? '',
    companyDomain: '',
    linkedinUrl: candidate.linkedin_url ?? candidate.provider_url ?? '',
    country: '',
    city: '',
  }

  const businessDate = new Date().toISOString().slice(0, 10)
  const primary = input.primary
  const fallback = input.fallback

  if (primary) {
    const budget = await providerBudgetRemaining(client, organizationId, primary.name, businessDate)
    if (budget <= 0) return 'BUDGET_EXHAUSTED'

    const enrichment = await primary.enrich(person)
    await spendProviderCredits(client, organizationId, primary.name, businessDate, enrichment.creditsUsed)

    if (enrichment.email && enrichment.verification !== 'INVALID') {
      await persistCandidateEmail(client, input, candidate, enrichment, primary.name)
      return 'ENRICHED'
    }
  }

  // Fallback: only with a company domain AND a full name (§7).
  if (!person.companyDomain || !person.displayName.trim()) return 'NO_EMAIL_AVAILABLE'
  if (!fallback) return primary ? 'NO_EMAIL_AVAILABLE' : 'PROVIDER_UNAVAILABLE'

  const budget = await providerBudgetRemaining(client, organizationId, fallback.name, businessDate)
  if (budget <= 0) return 'BUDGET_EXHAUSTED'

  const found = await fallback.findEmail(person)
  await spendProviderCredits(client, organizationId, fallback.name, businessDate, found.creditsUsed)
  if (!found.email) return 'NO_EMAIL_AVAILABLE'

  // Only a verified (or explicitly risky-but-real) address becomes sendable.
  const verified = found.verification === 'VERIFIED' || found.verification === 'RISKY'
  if (!verified) {
    await persistCandidateEmail(client, input, candidate, found, fallback.name)
    return 'NO_EMAIL_AVAILABLE'
  }

  const check = await fallback.verifyEmail(found.email)
  await spendProviderCredits(client, organizationId, fallback.name, businessDate, check.creditsUsed)
  const final = check.email
    ? { ...check, verification: check.verification === 'VERIFIED' || check.verification === 'RISKY' ? check.verification : found.verification }
    : found

  await persistCandidateEmail(client, input, candidate, final, fallback.name)
  return final.verification === 'VERIFIED' || final.verification === 'RISKY' ? 'ENRICHED' : 'NO_EMAIL_AVAILABLE'
}

export { STALE_DAYS_DEFAULT }
