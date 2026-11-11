/**
 * Fresh Prospects — the operational view over provider-discovered candidates.
 *
 * Reads the ONE staging authority (`captured_prospects`) and the ONE contact
 * authority (`contact_points`). No second candidate table, no second filter.
 */
import type { DbClient } from '@/lib/db/types'

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
  bestProfileId: string | null
  bestProfileName: string | null
  bestProfileMatch: number | null
  matchAmbiguous: boolean
  searchName: string
}

export async function loadFreshProspects(
  client: DbClient,
  orgId: string,
  profileFilter?: string | null,
  limit = 100,
): Promise<FreshProspectRow[]> {
  const { data: candidates, error } = await client
    .from('captured_prospects')
    .select(`id, provider, provider_person_id, provider_url, extracted_name, extracted_title, extracted_company,
      extracted_location, linkedin_url, canonical_score, discovered_at, canonical_intelligence, search_id`)
    .eq('organization_id', orgId)
    .eq('qualified', true)
    .eq('status', 'captured')
    .order('discovered_at', { ascending: false })
    .limit(limit)
  if (error) throw error

  const rows = (candidates ?? []) as Array<Record<string, unknown>>
  const personIds = [...new Set(rows.map((row) => row.provider_person_id as string).filter(Boolean))]
  const contactByPerson = new Map<string, { email: string | null; status: string | null; provider: string | null }>()
  if (personIds.length > 0) {
    const { data: contacts } = await client
      .from('contact_points')
      .select('person_id, value, verification_status, source_type')
      .eq('organization_id', orgId)
      .eq('type', 'email')
      .in('person_id', personIds)
      .limit(500)
    for (const contact of (contacts ?? []) as Array<Record<string, unknown>>) {
      contactByPerson.set(contact.person_id as string, {
        email: (contact.value as string) ?? null,
        status: (contact.verification_status as string) ?? null,
        provider: (contact.source_type as string) ?? null,
      })
    }
  }

  const { data: searches } = await client
    .from('provider_saved_searches')
    .select('id, name')
    .eq('organization_id', orgId)
    .limit(200)
  const searchNameById = new Map((searches ?? []).map((row) => [row.id as string, row.name as string]))

  return rows.map((row) => {
    const intelligence = row.canonical_intelligence as { match?: { best?: { profileId?: string; name?: string; matchScore?: number }; rankings?: Array<{ profileId?: string; matchScore?: number }>; ambiguous?: boolean } } | null
    const best = intelligence?.match?.best ?? null
    const rankings = intelligence?.match?.rankings ?? []
    const second = rankings[1]?.matchScore ?? 0
    const ambiguous = Boolean(intelligence?.match?.ambiguous) || (best?.matchScore ?? 0) > 0 && second / (best?.matchScore ?? 1) > 0.85

    const contact = row.provider_person_id ? contactByPerson.get(row.provider_person_id as string) : undefined
    return {
      candidateId: row.id as string,
      displayName: (row.extracted_name as string) ?? '',
      title: (row.extracted_title as string) ?? '',
      company: (row.extracted_company as string) ?? '',
      companyDomain: '',
      location: (row.extracted_location as string) ?? '',
      linkedinUrl: (row.linkedin_url as string) ?? (row.provider_url as string) ?? '',
      provider: (row.provider as string) ?? '',
      discoveredAt: (row.discovered_at as string) ?? '',
      canonicalScore: (row.canonical_score as number) ?? 0,
      qualification: '',
      email: contact?.email ?? null,
      emailStatus: contact?.status ?? null,
      emailProvider: contact?.provider ?? null,
      bestProfileId: best?.profileId ?? null,
      bestProfileName: best?.name ?? null,
      bestProfileMatch: best?.matchScore ?? null,
      matchAmbiguous: ambiguous,
      searchName: searchNameById.get(row.search_id as string) ?? '',
    }
  }).filter((row) => !profileFilter || row.bestProfileId === profileFilter)
}
