/**
 * Fresh Prospects — the operational view over provider-discovered candidates.
 *
 * Reads the ONE staging authority (`captured_prospects`) and the ONE contact
 * authority (`contact_points`). No second candidate table, no second filter.
 * Suppressed addresses are never shown as sendable (§24, §46).
 */
import type { DbClient } from '@/lib/db/types'
import { normalizeEmail } from '@/lib/email/contact-points'
import { STALE_DAYS_DEFAULT } from './enrichment-service'

export interface FreshProspectRow {
  candidateId: string
  displayName: string
  title: string
  company: string
  companyDomain: string
  location: string
  linkedinUrl: string
  provider: string
  discoveredAt: string
  canonicalScore: number
  qualification: string
  email: string | null
  emailStatus: string | null
  emailProvider: string | null
  /** Verified more than STALE_DAYS_DEFAULT ago — reverify before sending (§26). */
  emailStale: boolean
  /** An active suppression row exists for this address (§24). */
  emailSuppressed: boolean
  bestProfileId: string | null
  bestProfileName: string | null
  bestProfileMatch: number | null
  matchAmbiguous: boolean
  searchName: string
}

interface ContactRow {
  person_id: string
  value: string
  verification_status: string
  source_type: string | null
  verified_at: string | null
}

export async function loadFreshProspects(
  client: DbClient,
  orgId: string,
  profileFilter?: string | null,
  limit = 100,
): Promise<FreshProspectRow[]> {
  const query = client
    .from('captured_prospects')
    .select(`id, provider, provider_person_id, provider_url, extracted_name, extracted_title, extracted_company,
      extracted_location, linkedin_url, canonical_score, discovered_at, canonical_intelligence, score_breakdown,
      sender_profile_id, search_id`)
    .eq('organization_id', orgId)
    .eq('qualified', true)
    .eq('status', 'captured')
    .order('discovered_at', { ascending: false })
    .limit(limit)

  // §18: filter by the suggested/selected profile. The suggested profile is
  // persisted on `sender_profile_id`, so this is a query — not a post-limit filter.
  const { data: candidates, error } = profileFilter
    ? await query.eq('sender_profile_id', profileFilter)
    : await query
  if (error) throw error

  const rows = (candidates ?? []) as Array<Record<string, unknown>>
  const personIds = [...new Set(rows.map((row) => row.provider_person_id as string).filter(Boolean))]
  const contactByPerson = new Map<string, ContactRow>()
  if (personIds.length > 0) {
    const { data: contacts } = await client
      .from('contact_points')
      .select('person_id, value, verification_status, source_type, verified_at')
      .eq('organization_id', orgId)
      .eq('type', 'email')
      .in('person_id', personIds)
      .limit(500)
    for (const contact of (contacts ?? []) as ContactRow[]) {
      contactByPerson.set(contact.person_id, contact)
    }
  }

  // Suppression is org contact safety, not a UI flag (§24). One batched read.
  const emails = [...new Set([...contactByPerson.values()].map((row) => row.value).filter(Boolean))]
  const suppressedKeys = new Set<string>()
  if (emails.length > 0) {
    const { data: suppressions } = await client
      .from('email_suppressions')
      .select('email_key')
      .eq('organization_id', orgId)
      .eq('active', true)
      .in('email_key', emails.map((email) => normalizeEmail(email)))
      .limit(500)
    for (const row of (suppressions ?? []) as Array<{ email_key: string }>) suppressedKeys.add(row.email_key)
  }

  const { data: searches } = await client
    .from('provider_saved_searches')
    .select('id, name')
    .eq('organization_id', orgId)
    .limit(200)
  const searchNameById = new Map((searches ?? []).map((row) => [row.id as string, row.name as string]))

  const staleBefore = Date.now() - STALE_DAYS_DEFAULT * 86_400_000

  return rows.map((row) => {
    const intelligence = row.canonical_intelligence as {
      person?: { companyDomain?: string }
      match?: { best?: { profileId?: string; name?: string; matchScore?: number }; rankings?: Array<{ profileId?: string; matchScore?: number }>; ambiguous?: boolean }
    } | null
    const best = intelligence?.match?.best ?? null
    const rankings = intelligence?.match?.rankings ?? []
    const second = rankings[1]?.matchScore ?? 0
    const ambiguous = Boolean(intelligence?.match?.ambiguous) || (best?.matchScore ?? 0) > 0 && second / (best?.matchScore ?? 1) > 0.85

    const contact = row.provider_person_id ? contactByPerson.get(row.provider_person_id as string) : undefined
    const email = contact?.value ?? null
    const suppressed = email ? suppressedKeys.has(normalizeEmail(email)) : false
    const stale = Boolean(
      contact?.verification_status === 'VERIFIED'
      && contact.verified_at
      && Number.isFinite(new Date(contact.verified_at).getTime())
      && new Date(contact.verified_at).getTime() < staleBefore,
    )
    const breakdown = row.score_breakdown as { qualification?: { qualification?: string } } | null

    return {
      candidateId: row.id as string,
      displayName: (row.extracted_name as string) ?? '',
      title: (row.extracted_title as string) ?? '',
      company: (row.extracted_company as string) ?? '',
      companyDomain: intelligence?.person?.companyDomain ?? '',
      location: (row.extracted_location as string) ?? '',
      linkedinUrl: (row.linkedin_url as string) ?? (row.provider_url as string) ?? '',
      provider: (row.provider as string) ?? '',
      discoveredAt: (row.discovered_at as string) ?? '',
      canonicalScore: (row.canonical_score as number) ?? 0,
      qualification: breakdown?.qualification?.qualification ?? '',
      email,
      emailStatus: contact?.verification_status ?? null,
      emailProvider: contact?.source_type ?? null,
      emailStale: stale,
      emailSuppressed: suppressed,
      bestProfileId: best?.profileId ?? null,
      bestProfileName: best?.name ?? null,
      bestProfileMatch: best?.matchScore ?? null,
      matchAmbiguous: ambiguous,
      searchName: searchNameById.get(row.search_id as string) ?? '',
    }
  })
}
