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
import { emitAction } from '@/lib/action-ledger'
import { getProviderAdapter, providerConfigured } from './provider-registry'

export type EnrichmentOutcome =
  | 'ENRICHED'
  | 'NOT_QUALIFIED'
  | 'NO_EMAIL_AVAILABLE'
  | 'BUDGET_EXHAUSTED'
  | 'PROVIDER_UNAVAILABLE'

export interface EnrichmentResult {
  outcome: EnrichmentOutcome
  /** Actual provider credits spent by this enrichment (search is separate). */
  creditsUsed: number
}

export interface EnrichmentInput {
  client: DbClient
  organizationId: string
  candidateId: string
  searchRunId?: string | null
  /** Primary reveal provider. Defaults to prospeo. */
  primary?: ProviderAdapter
  fallback?: ProviderAdapter
  telemetry?: TelemetrySink
  /**
   * Saved-search credit budget. 0 / null inherits the org budget in
   * `provider_config` (§16). Search discovery and reveal spend stay
   * distinguishable in `provider_telemetry`.
   */
  budgetOverride?: number | null
}

/** The provider person as it was stored on the candidate's intelligence. */
interface StoredPerson {
  providerPersonId?: string
  displayName?: string
  firstName?: string | null
  lastName?: string | null
  title?: string
  company?: string
  companyDomain?: string
  linkedinUrl?: string
  country?: string
  city?: string
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
  canonical_intelligence: { person?: StoredPerson } | null
  qualified: boolean
  status: string
}

/** An enriched address older than this must be reverified before sending (§26). */
export const STALE_DAYS_DEFAULT = 75

/** Remaining daily credit budget for a provider. 0 / no row means unlimited. */
export async function providerBudgetRemaining(
  client: DbClient,
  organizationId: string,
  provider: string,
  businessDate: string,
  budgetOverride?: number | null,
): Promise<number> {
  const { data, error } = await client
    .from('provider_config')
    .select('daily_credit_budget, credits_used_today, budget_date')
    .eq('organization_id', organizationId)
    .eq('provider', provider)
    .maybeSingle()
  if (error) throw error

  const override = budgetOverride && budgetOverride > 0 ? budgetOverride : null
  const configured = override ?? ((data?.daily_credit_budget as number | null) ?? 0)
  if (!data && !override) return Number.POSITIVE_INFINITY
  if (configured <= 0) return Number.POSITIVE_INFINITY

  const budgetDate = data?.budget_date ? String(data.budget_date).slice(0, 10) : null
  const used = budgetDate === businessDate ? ((data?.credits_used_today as number) ?? 0) : 0
  return Math.max(0, configured - used)
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
 *
 * `ignoreDuplicates` is `ON CONFLICT DO NOTHING` (no conflict target): the
 * candidate unique index is PARTIAL, so a targeted `ON CONFLICT (cols)` cannot
 * be inferred by Postgres. The unique index still arbitrates the race.
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
  const email = enrichment.email
  const verification = toContactVerification(enrichment.verification)

  const { error } = await client
    .from('contact_points')
    .upsert(
      {
        organization_id: input.organizationId,
        lead_id: null,
        person_id: candidate.provider_person_id,
        type: 'email',
        value: email,
        source: 'CONNECTED_PROVIDER',
        source_type: providerName,
        verification_status: verification,
        verification_method: providerName,
        confidence: verification === 'VERIFIED' ? 1 : 0.6,
        is_primary: true,
        is_business_contact: true,
        discovered_at: now,
        verified_at: verification === 'VERIFIED' ? now : null,
        updated_at: now,
      },
      { ignoreDuplicates: true },
    )
  if (error) throw error

  // Discovery/enrichment are real product events, but they are GENERATED —
  // they never count toward execution targets (§29, §30).
  const normalized = email.toLowerCase()
  await emitAction({
    client,
    orgId: input.organizationId,
    actionType: 'EMAIL_ENRICHED',
    actorType: 'system',
    channel: 'email',
    executionStatus: 'generated',
    metadata: { provider: providerName, candidateId: candidate.id, verification },
    idempotencyKey: `email:enriched:${candidate.id}:${normalized}`,
  })
  if (verification === 'VERIFIED') {
    await emitAction({
      client,
      orgId: input.organizationId,
      actionType: 'EMAIL_VERIFIED',
      actorType: 'system',
      channel: 'email',
      executionStatus: 'generated',
      metadata: { provider: providerName, candidateId: candidate.id },
      idempotencyKey: `email:verified:${candidate.id}:${normalized}`,
    })
  }
}

export async function selectivelyEnrichCandidate(input: EnrichmentInput): Promise<EnrichmentResult> {
  const { client, organizationId, candidateId } = input
  let creditsUsed = 0

  const { data, error } = await client
    .from('captured_prospects')
    .select('id, provider, provider_person_id, provider_url, extracted_name, extracted_company, extracted_title, linkedin_url, canonical_intelligence, qualified, status')
    .eq('id', candidateId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('CANDIDATE_NOT_FOUND')
  const candidate = data as unknown as CandidateRow

  // §6 / §43: an unqualified candidate spends nothing.
  if (!candidate.qualified || candidate.status === 'discarded') return { outcome: 'NOT_QUALIFIED', creditsUsed: 0 }

  // Rebuild the provider person from the intelligence captured at discovery.
  // Without this the Snov fallback can never fire: the candidate row has no
  // company-domain or first/last-name columns (§7).
  const stored = candidate.canonical_intelligence?.person ?? null
  const person: ProviderPerson = {
    providerPersonId: candidate.provider_person_id ?? candidate.id,
    displayName: stored?.displayName ?? candidate.extracted_name ?? '',
    firstName: stored?.firstName ?? null,
    lastName: stored?.lastName ?? null,
    title: stored?.title ?? candidate.extracted_title ?? '',
    company: stored?.company ?? candidate.extracted_company ?? '',
    companyDomain: stored?.companyDomain ?? '',
    linkedinUrl: stored?.linkedinUrl ?? candidate.linkedin_url ?? candidate.provider_url ?? '',
    country: stored?.country ?? '',
    city: stored?.city ?? '',
  }

  const businessDate = new Date().toISOString().slice(0, 10)
  const primary = input.primary
  const fallback = input.fallback

  if (primary) {
    const budget = await providerBudgetRemaining(client, organizationId, primary.name, businessDate, input.budgetOverride)
    if (budget <= 0) return { outcome: 'BUDGET_EXHAUSTED', creditsUsed }

    const enrichment = await primary.enrich(person)
    creditsUsed += enrichment.creditsUsed
    await spendProviderCredits(client, organizationId, primary.name, businessDate, enrichment.creditsUsed)

    if (enrichment.email && enrichment.verification !== 'INVALID') {
      await persistCandidateEmail(client, input, candidate, enrichment, primary.name)
      return { outcome: 'ENRICHED', creditsUsed }
    }
  }

  // Fallback: only with a company domain AND a full name (§7).
  if (!person.companyDomain || !person.displayName.trim()) return { outcome: 'NO_EMAIL_AVAILABLE', creditsUsed }
  if (!fallback) {
    return { outcome: primary ? 'NO_EMAIL_AVAILABLE' : 'PROVIDER_UNAVAILABLE', creditsUsed }
  }

  const budget = await providerBudgetRemaining(client, organizationId, fallback.name, businessDate, input.budgetOverride)
  if (budget <= 0) return { outcome: 'BUDGET_EXHAUSTED', creditsUsed }

  const found = await fallback.findEmail(person)
  creditsUsed += found.creditsUsed
  await spendProviderCredits(client, organizationId, fallback.name, businessDate, found.creditsUsed)
  if (!found.email) return { outcome: 'NO_EMAIL_AVAILABLE', creditsUsed }

  // Only a verified (or explicitly risky-but-real) address becomes sendable.
  const verified = found.verification === 'VERIFIED' || found.verification === 'RISKY'
  if (!verified) {
    await persistCandidateEmail(client, input, candidate, found, fallback.name)
    return { outcome: 'NO_EMAIL_AVAILABLE', creditsUsed }
  }

  const check = await fallback.verifyEmail(found.email)
  creditsUsed += check.creditsUsed
  await spendProviderCredits(client, organizationId, fallback.name, businessDate, check.creditsUsed)
  const final = check.email
    ? { ...check, verification: check.verification === 'VERIFIED' || check.verification === 'RISKY' ? check.verification : found.verification }
    : found

  await persistCandidateEmail(client, input, candidate, final, fallback.name)
  return {
    outcome: final.verification === 'VERIFIED' || final.verification === 'RISKY' ? 'ENRICHED' : 'NO_EMAIL_AVAILABLE',
    creditsUsed,
  }
}

export interface LeadEnrichmentInput {
  client: DbClient
  organizationId: string
  leadId: string
  linkedinUrl: string
  displayName?: string | null
  company?: string | null
  companyDomain?: string | null
  budgetOverride?: number | null
  primary?: ProviderAdapter
  telemetry?: TelemetrySink
}

/**
 * Manual Prospect → Lead enrichment (§4, §42).
 *
 * The manual path has a LinkedIn URL but no provider person id, so it enriches
 * by URL. Only a qualified lead reaches a paid call, and only a VERIFIED (or
 * explicitly risky-but-real) address is persisted as a contact.
 */
export async function enrichLeadFromLinkedIn(input: LeadEnrichmentInput): Promise<EnrichmentResult> {
  const { client, organizationId, leadId } = input
  if (!input.primary) return { outcome: 'PROVIDER_UNAVAILABLE', creditsUsed: 0 }

  const businessDate = new Date().toISOString().slice(0, 10)
  const budget = await providerBudgetRemaining(client, organizationId, input.primary.name, businessDate, input.budgetOverride)
  if (budget <= 0) return { outcome: 'BUDGET_EXHAUSTED', creditsUsed: 0 }

  const person: ProviderPerson = {
    providerPersonId: '',
    displayName: input.displayName ?? '',
    firstName: null,
    lastName: null,
    title: '',
    company: input.company ?? '',
    companyDomain: input.companyDomain ?? '',
    linkedinUrl: input.linkedinUrl,
    country: '',
    city: '',
  }

  const enrichment = await input.primary.enrich(person)
  await spendProviderCredits(client, organizationId, input.primary.name, businessDate, enrichment.creditsUsed)
  if (!enrichment.email || enrichment.verification === 'INVALID') {
    return { outcome: 'NO_EMAIL_AVAILABLE', creditsUsed: enrichment.creditsUsed }
  }

  await persistLeadEmail(client, organizationId, leadId, enrichment, input.primary.name)
  return {
    outcome: enrichment.verification === 'VERIFIED' || enrichment.verification === 'RISKY' ? 'ENRICHED' : 'NO_EMAIL_AVAILABLE',
    creditsUsed: enrichment.creditsUsed,
  }
}

async function persistLeadEmail(
  client: DbClient,
  organizationId: string,
  leadId: string,
  enrichment: ProviderEnrichment,
  providerName: string,
): Promise<void> {
  const email = enrichment.email!
  const verification = toContactVerification(enrichment.verification)
  const now = new Date().toISOString()
  const { error } = await client
    .from('contact_points')
    .upsert(
      {
        organization_id: organizationId,
        lead_id: leadId,
        person_id: null,
        type: 'email',
        value: email,
        source: 'CONNECTED_PROVIDER',
        source_type: providerName,
        verification_status: verification,
        verification_method: providerName,
        confidence: verification === 'VERIFIED' ? 1 : 0.6,
        is_primary: true,
        is_business_contact: true,
        discovered_at: now,
        verified_at: verification === 'VERIFIED' ? now : null,
        updated_at: now,
      },
      { ignoreDuplicates: true },
    )
  if (error) throw error

  const normalized = email.toLowerCase()
  await emitAction({
    client,
    orgId: organizationId,
    actionType: 'EMAIL_ENRICHED',
    actorType: 'system',
    channel: 'email',
    leadId,
    executionStatus: 'generated',
    metadata: { provider: providerName, verification },
    idempotencyKey: `email:enriched:${leadId}:${normalized}`,
  })
  if (verification === 'VERIFIED') {
    await emitAction({
      client,
      orgId: organizationId,
      actionType: 'EMAIL_VERIFIED',
      actorType: 'system',
      channel: 'email',
      leadId,
      executionStatus: 'generated',
      metadata: { provider: providerName },
      idempotencyKey: `email:verified:${leadId}:${normalized}`,
    })
  }
}

export interface StaleContact {
  id: string
  value: string
  verificationStatus: string
  verifiedAt: string | null
}

/**
 * §26 — an old verified address is reverified BEFORE it is sent to.
 *
 * Reverification is free (Snov verification) and happens only when a send is
 * about to occur (never a bulk sweep). It FAILS CLOSED: a stale address is not
 * sendable unless a verifier is available and confirms it.
 */
export async function reverifyStaleContact(
  client: DbClient,
  orgId: string,
  contact: StaleContact,
): Promise<'FRESH' | 'REVERIFIED' | 'INVALID' | 'UNVERIFIED' | 'VERIFICATION_REQUIRED'> {
  if (contact.verificationStatus !== 'VERIFIED' || !contact.verifiedAt) return 'FRESH'
  const verifiedAt = new Date(contact.verifiedAt).getTime()
  if (!Number.isFinite(verifiedAt) || Date.now() - verifiedAt < STALE_DAYS_DEFAULT * 86_400_000) return 'FRESH'
  if (!providerConfigured('snov')) return 'VERIFICATION_REQUIRED'

  try {
    const snov = getProviderAdapter('snov', { organizationId: orgId })
    const result = await snov.verifyEmail(contact.value)
    const status = toContactVerification(result.verification)
    await client
      .from('contact_points')
      .update({
        verification_status: status,
        verification_method: 'snov',
        verified_at: status === 'VERIFIED' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contact.id)

    if (status === 'VERIFIED') return 'REVERIFIED'
    if (status === 'INVALID' || status === 'BOUNCED') return 'INVALID'
    return 'UNVERIFIED'
  } catch {
    // Verifier outage, invalid schema, or a persistence failure: fail closed.
    return 'VERIFICATION_REQUIRED'
  }
}
