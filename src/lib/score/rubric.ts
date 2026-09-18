import type {
  ExtractedLead,
  OrganizationRulebook,
  ScoreBreakdownItem,
  ScoreResult,
  SignalDefinition,
  Verdict,
} from '@/lib/domain/types'
import { mapLocationToRegion } from '@/lib/leads/targeting-pure'

/**
 * Scout qualification rubric.
 *
 * Pure arithmetic. No model is ever consulted here. The score is the sum of
 * two groups:
 *
 *   Signal base (max rulebook.maxSignalWeight points)
 *     Each signal type has a configurable weight.
 *
 *   Completeness (max rulebook.maxCompleteness points)
 *     +1 url present
 *     +1 contact name present
 *     +1 contact title present
 *     +1 evidence is specific (mentions a number or a year)
 *     +1 verbatim quote present
 *     +2/-2 market region fit
 *
 * Verdict bands are configurable per organization via verdictThresholds.
 */
export function computeScore(
  lead: ExtractedLead,
  rulebook: OrganizationRulebook,
): ScoreResult {
  const signal = rulebook.signals.find((s) => s.id === lead.signalType) ?? null

  const evidenceSpecific = evidenceIsSpecific(lead.signalEvidence)
  const region = mapLocationToRegion(lead.locationRaw ?? null)
  const regionPoints = region === 'outside_core' ? -2 : region === 'unknown' ? 0 : 2

  const items: ScoreBreakdownItem[] = [
    {
      category: 'signal',
      label: signal ? `${signal.short} (${signal.name})` : 'No signal',
      points: signal ? signal.weight : 0,
      max: rulebook.maxSignalWeight,
      note: signal
        ? signal.description
        : 'No recognized signal type was extracted.',
    },
    {
      category: 'completeness',
      label: 'URL present',
      points: lead.url ? 1 : 0,
      max: 1,
      note: lead.url ? 'Source URL on file.' : 'Add a source URL for this lead.',
    },
    {
      category: 'completeness',
      label: 'Contact name present',
      points: lead.name ? 1 : 0,
      max: 1,
      note: lead.name ? 'Named person identified.' : 'No named person yet.',
    },
    {
      category: 'completeness',
      label: 'Contact title present',
      points: lead.title ? 1 : 0,
      max: 1,
      note: lead.title ? 'Title known.' : 'Title not known.',
    },
    {
      category: 'completeness',
      label: 'Evidence is specific',
      points: evidenceSpecific ? 1 : 0,
      max: 1,
      note: evidenceSpecific
        ? 'Evidence cites a concrete number or date.'
        : 'Evidence is vague; no number or date to anchor on.',
    },
    {
      category: 'completeness',
      label: 'Core market fit',
      points: regionPoints,
      max: 2,
      note:
        region === 'outside_core'
          ? 'Location maps outside the core markets (US, UK, EU, CA, AU, UAE, SG).'
          : region === 'unknown'
            ? 'Location missing or ambiguous; no market-fit adjustment applied.'
            : `Location maps to core market ${region}.`,
    },
    {
      category: 'completeness',
      label: 'Verbatim quote',
      points: lead.verbatimQuote ? 1 : 0,
      max: 1,
      note: lead.verbatimQuote
        ? 'A verbatim quote is on file.'
        : 'No quotable line captured.',
    },
  ]

  const rawTotal = items.reduce((sum, item) => sum + item.points, 0)
  const total = Math.max(0, Math.min(12, rawTotal))
  const baseVerdict = verdictFor(total, rulebook)
  const gates: string[] = []

  let verdict = baseVerdict
  const confidence = lead.extractionConfidence ?? 100
  if (confidence < rulebook.confidenceSendThreshold && baseVerdict === 'send') {
    verdict = 'research_more'
    gates.push(
      `Extraction confidence is ${confidence}/100 (needs ${rulebook.confidenceSendThreshold}+ for auto-send).`,
    )
  }
  for (const note of lead.confidenceNotes ?? []) {
    gates.push(note)
  }

  return { total, verdict, baseVerdict, breakdown: items, gates }
}

export function verdictFor(total: number, rulebook: OrganizationRulebook): Verdict {
  const t = rulebook.verdictThresholds
  if (total >= t.send.min) return 'send'
  if (total >= t.research_more.min) return 'research_more'
  return 'skip'
}

/** Deterministic check: does the evidence cite a number or a 4-digit year? */
function evidenceIsSpecific(evidence: string | null | undefined): boolean {
  if (!evidence) return false
  const trimmed = evidence.trim()
  if (trimmed.length === 0) return false
  if (trimmed.length < 12) return false
  return /\d{1,3}(?:[,.]\d+)?/.test(trimmed) || /\b(19|20)\d{2}\b/.test(trimmed)
}
