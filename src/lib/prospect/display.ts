import { qualifyCanonicalScore } from '@/lib/scoring/qualification'

/**
 * Prospect workspace display contracts.
 *
 * Pure mappings so every surface (result, recent, saved, watchlist) reads the
 * same decision, status and confidence language. No scoring or extraction logic
 * lives here — these only label what the canonical pipeline already decided.
 */

export type ProspectStatus = 'lead' | 'watchlist' | 'dismissed' | 'not_actioned'

export const PROSPECT_STATUS_LABELS: Record<ProspectStatus, string> = {
  lead: 'Lead',
  watchlist: 'Watchlist',
  dismissed: 'Dismissed',
  not_actioned: 'Not actioned',
}

export const PROSPECT_STATUS_VARIANT: Record<ProspectStatus, 'success' | 'cobalt' | 'warning' | 'neutral'> = {
  lead: 'success',
  watchlist: 'cobalt',
  dismissed: 'warning',
  not_actioned: 'neutral',
}

/**
 * Status is derived, never inferred: `discarded` is a dismissal, a converted
 * capture is a Lead unless its lead sits in the Observe stage (the watchlist),
 * and a capture that was never actioned stays "Not actioned".
 */
export function prospectStatus(
  row: { status: 'captured' | 'converted' | 'discarded'; convertedLeadId?: string | null },
  convertedStage?: string | null,
): ProspectStatus {
  if (row.status === 'discarded') return 'dismissed'
  if (row.status === 'converted') return convertedStage === 'observe' ? 'watchlist' : 'lead'
  return 'not_actioned'
}

export type ProspectDecision = 'CONTACT' | 'OBSERVE' | 'RESEARCH' | 'SKIP'

const ACTION_WORD: Record<string, ProspectDecision> = {
  CONTACT_NOW: 'CONTACT',
  CONNECT_WITH_NOTE: 'CONTACT',
  REPLY_NOW: 'CONTACT',
  FOLLOW_UP: 'CONTACT',
  CONNECT_WITHOUT_NOTE: 'OBSERVE',
  OBSERVE: 'OBSERVE',
  RESEARCH_MORE: 'RESEARCH',
  WAIT: 'RESEARCH',
  DEFER: 'RESEARCH',
  REFER: 'RESEARCH',
  ASK_FOR_HELP: 'RESEARCH',
  SKIP: 'SKIP',
  CLOSE: 'SKIP',
}

/**
 * The decision word comes from the ONE recommended action. The qualification
 * is only a fallback for analyses that predate the action packet.
 */
export function decisionWordFor(
  action: string | null | undefined,
  qualification?: string | null,
): ProspectDecision {
  if (action && ACTION_WORD[action]) return ACTION_WORD[action]
  switch (qualification) {
    case 'strong':
    case 'worth_pursuing':
      return 'CONTACT'
    case 'maybe':
    case 'low':
      return 'RESEARCH'
    case 'skip':
      return 'SKIP'
    default:
      return 'OBSERVE'
  }
}

export type ProspectAction = { label: string; kind: 'create' | 'watchlist' | 'dismiss' }

/**
 * One primary action per decision. Watchlist is the honest home for both
 * "observe" and "research more": the product has no separate watchlist store,
 * an Observe-stage lead IS the watchlist. Dismiss clears an unsaved check.
 */
export function primaryActionFor(word: ProspectDecision): ProspectAction {
  switch (word) {
    case 'CONTACT':
      return { label: 'Create Lead', kind: 'create' }
    case 'OBSERVE':
    case 'RESEARCH':
      return { label: 'Save to Watchlist', kind: 'watchlist' }
    case 'SKIP':
      return { label: 'Dismiss', kind: 'dismiss' }
  }
}

/** Extraction completeness is a whole-identity signal, never a per-field meter. */
export function confidenceLabel(score: number | null | undefined): 'High' | 'Medium' | 'Low' | null {
  if (score == null || !Number.isFinite(score)) return null
  if (score >= 80) return 'High'
  if (score >= 50) return 'Medium'
  return 'Low'
}

const SOURCE_LABELS: Record<string, string> = {
  linkedin_profile: 'LinkedIn',
  linkedin_post: 'LinkedIn post',
  job_posting: 'Job post',
  company_website: 'Company website',
  pasted_text: 'Pasted text',
  mixed: 'Mixed source',
}

export function sourceLabelFor(sourceType: string | null | undefined): string | null {
  if (!sourceType) return null
  return SOURCE_LABELS[sourceType] ?? null
}

const RELATIONSHIP_LABELS: Record<string, string> = {
  POTENTIAL_BUYER: 'Potential buyer',
  RECRUITER: 'Recruiter',
  POTENTIAL_PARTNER: 'Potential partner',
  NETWORKING: 'Networking',
  PEER: 'Peer',
}

export function relationshipLabel(relationship: string | null | undefined): string | null {
  if (!relationship) return null
  return RELATIONSHIP_LABELS[relationship] ?? null
}

/** Recent rows carry a score, not the canonical blob — label it from the band. */
export function decisionLabelForScore(score: number | null | undefined): string | null {
  if (score == null || !Number.isFinite(score)) return null
  return qualifyCanonicalScore(score).headline
}

/** 'COMMERCIAL_POTENTIAL_HIGH' → 'Commercial potential high'. */
export function enumLabel(value: string | null | undefined): string | null {
  if (!value || !value.trim()) return null
  const spaced = value.trim().replaceAll('_', ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase()
}
