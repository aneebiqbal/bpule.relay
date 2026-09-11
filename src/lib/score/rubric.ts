import type {
  ExtractedLead,
  ScoreBreakdownItem,
  ScoreResult,
  Verdict,
} from '@/lib/domain/types'
import { signalById, VERDICT_RULES } from '@/lib/score/signals'

/**
 * Scout qualification rubric (published, version 1).
 *
 * Pure arithmetic. No model is ever consulted here. The score is the sum of
 * two groups:
 *
 *   Signal base (max 7 points)
 *     Each of the seven signal types has a published weight. The weight is the
 *     distance between the signal and "this team needs delivery help now."
 *
 *   Completeness (max 5 points)
 *     +1 url present
 *     +1 contact name present
 *     +1 contact title present
 *     +1 evidence is specific (mentions a number or a year)
 *     +1 verbatim quote present
 *
 *   Total max 12.
 *
 * Verdicts
 *    10-12 send
 *    7-9   research_more
 *    0-6   skip
 */
export function computeScore(lead: ExtractedLead): ScoreResult {
  const signal = signalById(lead.signalType)

  const evidenceSpecific = evidenceIsSpecific(lead.signalEvidence)

  const items: ScoreBreakdownItem[] = [
    {
      category: 'signal',
      label: signal ? `${signal.short} (${signal.name})` : 'No signal',
      points: signal ? signal.weight : 0,
      max: 7,
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
      label: 'Verbatim quote',
      points: lead.verbatimQuote ? 1 : 0,
      max: 1,
      note: lead.verbatimQuote
        ? 'A verbatim quote is on file.'
        : 'No quotable line captured.',
    },
  ]

  const total = items.reduce((sum, item) => sum + item.points, 0)
  const verdict = verdictFor(total)

  return { total, verdict, breakdown: items }
}

export function verdictFor(total: number): Verdict {
  if (total >= VERDICT_RULES.send.min) return 'send'
  if (total >= VERDICT_RULES.research_more.min) return 'research_more'
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