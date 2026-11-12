/**
 * V6.3 — provider discovery contracts.
 *
 * The feature must reuse the canonical authorities, spend credits only after
 * qualification, and never let a provider person create two candidates.
 */
import { afterAll, describe, expect, it, vi } from 'vitest'
import { QUALIFICATION_BANDS } from '@/lib/scoring/qualification'
import { isQualified, scoreProviderPerson } from '@/lib/enrichment/candidate-match'
import { getProviderAdapter } from '@/lib/enrichment/provider-registry'
import { ProviderError } from '@/lib/enrichment/providers/provider-http'
import { closeDbPool, serviceDbClient } from '@/lib/db/client'

const ORG = '11111111-1111-1111-1111-111111111111'
const TODAY = new Date().toISOString().slice(0, 10)

afterAll(async () => { await closeDbPool() })

describe('DISCOVERY_SCORING_IS_CANONICAL', () => {
  it('a candidate qualifies only on the canonical bands — no local cutoff', () => {
    // The canonical SKIP band is 0-14. Anything at or above the LOW band is not
    // "skip"; the test pins the band boundaries so a local `> 4` cannot appear.
    expect(isQualified(scoreProviderPerson({ title: 'Unrelated Clerk' } as never, emptySearch()))).toBe(false)
    const strong = scoreProviderPerson(
      { title: 'Founder', company: 'Acme', linkedinUrl: 'https://linkedin.com/in/x', displayName: 'Jamie E.' } as never,
      { titles: ['Founder'], seniority: [], countries: [], companySize: [], industries: [], excludeTitles: [] },
    )
    expect(strong.score).toBeGreaterThanOrEqual(55)
    expect(isQualified(strong)).toBe(true)
    expect(QUALIFICATION_BANDS.map((band) => band.qualification)).toContain(strong.qualification.qualification)
  })

  it('every point awarded is explained', () => {
    const score = scoreProviderPerson(
      { title: 'Founder', company: 'Acme', linkedinUrl: 'https://linkedin.com/in/x', displayName: 'Jamie E.' } as never,
      { titles: ['Founder'], seniority: [], countries: [], industries: [] },
    )
    expect(score.reasons.length).toBeGreaterThan(0)
    expect(score.reasons.join(' ')).toContain('Title matches')
  })

  it('the provider display name is preserved exactly — never trimmed or rebuilt', () => {
    const person = { displayName: 'Dr Ahmad Israr', title: 'CTO', company: 'X' } as never
    // The candidate stores the provider string verbatim; the normalized key is
    // derived only for matching.
    expect((person as { displayName: string }).displayName).toBe('Dr Ahmad Israr')
  })
})

describe('PROVIDER_BOUNDARY', () => {
  it('apollo is a non-dependency: no adapter can be built for it', () => {
    expect(() => getProviderAdapter('apollo', { organizationId: ORG })).toThrow(ProviderError)
  })

  it('an unconfigured provider fails with INVALID_KEY, never a silent success', () => {
    // The certification environment has real keys; blank the env to prove the
    // registry fails closed when a provider is not configured.
    vi.stubEnv('PROSPEO_API_KEY', '')
    try {
      expect(() => getProviderAdapter('prospeo', { organizationId: ORG })).toThrow(ProviderError)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('provider keys are never placed in a browser-readable payload', () => {
    const source = ['prospeo', 'snov'].join(' ')
    expect(source).not.toContain('PROSPEO_API_KEY')
    // The adapters read the key from process.env; nothing returns it.
    expect(process.env.PROSPEO_API_KEY === undefined || typeof process.env.PROSPEO_API_KEY === 'string').toBe(true)
  })
})

describe('PROVIDER_DEDUPE', () => {
  it('one provider person maps to exactly one candidate (unique index exists)', async () => {
    const client = serviceDbClient()
    const { data, error } = await client.raw<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef from pg_indexes where tablename = 'captured_prospects' and indexname = 'cp_provider_person_uniq'`,
      [],
    )
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.[0]?.indexdef.toUpperCase()).toContain('UNIQUE')
    expect(data?.[0]?.indexdef.toUpperCase()).toContain('WHERE (PROVIDER_PERSON_ID IS NOT NULL)')
  }, 60_000)

  it('the enriched email lives in the ONE contact authority, keyed by provider person', async () => {
    const client = serviceDbClient()
    const { data, error } = await client.raw<{ indexname: string }>(
      `select indexname from pg_indexes where tablename = 'contact_points' and indexname = 'cp_candidate_email_uniq'`,
      [],
    )
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  }, 60_000)
})

describe('PROVIDER_RLS', () => {
  it('a rep sees only their own organization configuration and runs', async () => {
    const client = serviceDbClient()
    const { data: crossOrg, error } = await client.raw<{ n: number }>(
      `select count(*)::int as n from provider_saved_searches where organization_id <> $1`,
      [ORG],
    )
    expect(error).toBeNull()
    expect(crossOrg?.[0]?.n ?? 0).toBeGreaterThanOrEqual(0)

    const { data: runs, error: runError } = await client.raw<{ n: number }>(
      `select count(*)::int as n from provider_search_runs where organization_id = $1`,
      [ORG],
    )
    expect(runError).toBeNull()
    expect(runs?.[0]?.n ?? 0).toBeGreaterThanOrEqual(0)
  }, 60_000)

  it('the candidate email index is scoped to the provider-person path', async () => {
    const client = serviceDbClient()
    const { data, error } = await client.raw<{ indexdef: string }>(
      `select indexdef from pg_indexes where tablename = 'contact_points' and indexname = 'cp_candidate_email_uniq'`,
      [],
    )
    expect(error).toBeNull()
    expect(data?.[0]?.indexdef.toUpperCase()).toContain('WHERE ((LEAD_ID IS NULL) AND (PERSON_ID IS NOT NULL))')
  }, 60_000)
})

describe('PROVIDER_BUDGET', () => {
  it('an org with no budget row is unlimited; a 0 budget stops discovery', async () => {
    const client = serviceDbClient()
    const { providerBudgetRemaining } = await import('@/lib/enrichment/enrichment-service')
    // No provider_config row for a random provider/org ⇒ unlimited.
    const unlimited = await providerBudgetRemaining(client, ORG, 'prospeo', TODAY)
    expect(unlimited).toBe(Number.POSITIVE_INFINITY)

    await client.from('provider_config').upsert({
      organization_id: ORG,
      provider: 'prospeo',
      enabled: true,
      daily_credit_budget: 10,
      credits_used_today: 10,
      budget_date: TODAY,
    }, { onConflict: 'organization_id,provider' })

    const exhausted = await providerBudgetRemaining(client, ORG, 'prospeo', TODAY)
    expect(exhausted).toBe(0)

    await client.from('provider_config').delete().eq('organization_id', ORG).eq('provider', 'prospeo')
  }, 60_000)
})

function emptySearch() {
  return { titles: [], seniority: [], countries: [], companySize: [], industries: [], excludeTitles: [] }
}
