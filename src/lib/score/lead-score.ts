import type { Lead, OrganizationRulebook } from '@/lib/domain/types'
import { computeScore } from '@/lib/score/rubric'

/**
 * Single source of truth for a lead's displayed score.
 *
 * The stored lead.score (written at extract/scoring time) is authoritative;
 * re-computation only happens as a fallback for leads with no stored score
 * (e.g. imported before a rulebook existed). Both the leads list page and the
 * lead detail page call this, so the number is guaranteed identical wherever
 * a lead's score appears.
 */
export function resolveLeadScore(
  lead: Lead,
  rulebook: OrganizationRulebook | null,
): number | null {
  if (typeof lead.score === 'number') return lead.score
  if (!rulebook) return null
  return computeScore(
    {
      name: lead.contactName,
      title: lead.contactTitle,
      company: lead.company,
      url: lead.url,
      signalType: lead.signalType ?? 7,
      signalEvidence: lead.signalEvidence ?? '',
      verbatimQuote: lead.verbatimQuote,
      tags: lead.tags ?? [],
    },
    rulebook,
  ).total
}