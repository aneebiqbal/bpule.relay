/**
 * Candidate scoring + profile match.
 *
 * The canonical qualification authority is `qualifyCanonicalScore` — the discovery
 * score is fed into the SAME bands the manual Prospect flow uses (§6). No second
 * threshold is invented.
 *
 * The profile match reuses `rankSendersForLead`, so a suggested sender is chosen
 * by the same authority that routes a stored lead.
 */
import type { DbClient } from '@/lib/db/types'
import { qualifyCanonicalScore, type QualificationBand } from '@/lib/scoring/qualification'
import { rankSendersForLead, type RoutingLeadContext, type SenderProfile } from '@/lib/relay/sender-routing-engine'
import type { ProviderPerson } from './providers/types'

/** Deterministic, explainable discovery score. 0-100 on the canonical scale. */
export interface DiscoveryScore {
  score: number
  qualification: QualificationBand
  reasons: string[]
}

export interface SavedSearchLike {
  titles: string[]
  seniority: string[]
  countries: string[]
  industries: string[]
}

function normalized(values: readonly string[]): Set<string> {
  return new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))
}

/**
 * Score a provider person against the search that found them.
 *
 * The provider search already filtered on title/seniority/location, so the score
 * measures how WELL the person matches the saved search — plus whether they are
 * a plausible buyer at all. Every point is explained.
 */
export function scoreProviderPerson(
  person: ProviderPerson,
  search: SavedSearchLike,
): DiscoveryScore {
  const reasons: string[] = []
  let score = 0

  const titles = normalized(search.titles)
  const title = (person.title ?? '').trim().toLowerCase()
  const titleHits = [...titles].filter((needle) => title.includes(needle)).length
  if (titleHits > 0) {
    const points = Math.min(40, 20 + titleHits * 10)
    score += points
    reasons.push(`Title matches the search (${titleHits} term${titleHits === 1 ? '' : 's'}) +${points}`)
  } else {
    reasons.push('Title does not match the search terms')
  }

  const seniority = normalized(search.seniority)
  if (seniority.size > 0) {
    const hit = [...seniority].some((level) => title.includes(level))
    if (hit) {
      score += 15
      reasons.push('Seniority matches +15')
    }
  }

  const countries = normalized(search.countries)
  if (countries.size > 0 && person.country) {
    const hit = [...countries].some((country) => person.country.toLowerCase().includes(country))
    if (hit) {
      score += 15
      reasons.push('Location matches +15')
    } else {
      reasons.push('Location is outside the search regions')
    }
  }

  const industries = normalized(search.industries)
  if (industries.size > 0) {
    // Provider search people results carry no industry; the company match is
    // handled by the profile match. No points are invented here.
    reasons.push('Industry filter is applied by the provider search')
  }

  if (person.company) {
    score += 10
    reasons.push('Current employer known +10')
  }
  if (person.linkedinUrl) {
    score += 10
    reasons.push('LinkedIn profile known +10')
  }
  if ((person.displayName ?? '').trim()) {
    score += 10
    reasons.push('Full name known +10')
  }

  const clamped = Math.max(0, Math.min(100, score))
  return { score: clamped, qualification: qualifyCanonicalScore(clamped), reasons }
}

/** A candidate only qualifies on the canonical bands — never a local cutoff. */
export function isQualified(score: DiscoveryScore): boolean {
  return score.qualification.qualification !== 'SKIP'
}

export interface ProfileMatchSuggestion {
  profileId: string
  name: string
  channel: string
  matchScore: number
  confidence: number
}

export interface ProfileMatchResult {
  best: ProfileMatchSuggestion | null
  rankings: ProfileMatchSuggestion[]
  /** True when the top two are too close to choose silently (§5). */
  ambiguous: boolean
}

/**
 * Suggest sender profiles for a candidate using the canonical ranking authority.
 * Ambiguity is surfaced, never resolved by a coin flip.
 */
export function rankCandidateProfiles(
  person: ProviderPerson,
  search: SavedSearchLike,
  senders: SenderProfile[],
): ProfileMatchResult {
  const context: RoutingLeadContext = {
    capabilities: [],
    industries: [...search.industries],
    buyerRequestProbability: 0,
    fitLevel: 'UNKNOWN',
    rawTerms: [person.company, person.title].filter(Boolean),
    platform: 'linkedin',
  }
  const leadLike = {
    company: person.company,
    contactTitle: person.title,
    senderProfileId: null,
  }

  const ranked = rankSendersForLead(context, senders, null)
  const rankings: ProfileMatchSuggestion[] = ranked.rankings.map((entry) => ({
    profileId: entry.senderId,
    name: entry.name ?? entry.senderId,
    channel: entry.platform ?? 'linkedin',
    matchScore: Math.round(entry.profileMatch ?? 0),
    confidence: Math.round((entry.confidence ?? 0) * 100) / 100,
  }))

  const best = rankings[0] ?? null
  const second = rankings[1] ?? null
  const ambiguous = Boolean(best && second && best.matchScore > 0 && second.matchScore / best.matchScore > 0.85)

  return { best, rankings, ambiguous }
}

export async function loadCandidateSenders(
  client: DbClient,
  orgId: string,
  repId: string,
): Promise<SenderProfile[]> {
  const { loadSenderProfiles } = await import('@/lib/relay/routing-context')
  return loadSenderProfiles(client, orgId, repId)
}
