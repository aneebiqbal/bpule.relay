import type {
  ExtractedLead,
  Profile,
  MatchedProof,
  SafeFact,
} from '@/lib/domain/types'
import { classifyLeadFact } from '@/lib/relay/profile-intelligence'

/**
 * Prospect Intelligence
 *
 * Holistic qualification for a pasted LinkedIn profile. Produces a 0–100
 * score built from explicit dimensions — never a single LLM-invented number.
 *
 * This is the pre-CRM filter: a BD user can decide in seconds whether to
 * pursue someone, without creating a lead first.
 */

export type EvidenceClass =
  | 'VERIFIED_PROFILE'
  | 'VERIFIED_PUBLIC'
  | 'INFERRED'
  | 'WEAK_SIGNAL'
  | 'UNKNOWN'

export type MentionSafety = 'SAFE_TO_MENTION' | 'INTERNAL_ONLY'

export interface ClassifiedSignal {
  label: string
  detail: string
  evidence: EvidenceClass
  mention: MentionSafety
}

export interface ScoreDimension {
  key: string
  category: string
  label: string
  points: number
  max: number
  note: string
}

export type Recommendation = 'connect' | 'maybe' | 'skip'

export interface ProspectScore {
  total: number
  recommendation: Recommendation
  dimensions: ScoreDimension[]
  why: string[]
  watchOut: string[]
  evidenceConfidence: number
  signals: ClassifiedSignal[]
}

export interface ProspectIntelligenceInput {
  extracted: ExtractedLead
  assignedProfiles: Profile[]
  profileIntelligences: Array<{
    profile: Profile
    matchedProof: MatchedProof[]
  }>
  bestSender: Profile | null
  bestSenderProof: MatchedProof[]
}

const SENIORITY_DECISION = /\b(ceo|cto|cio|coo|chief|founder|co[- ]?founder|president|partner|managing director|vp|head of|director)\b/i
const SENIORITY_TECHNICAL_LEAD = /\b(principal|staff|lead|architect|distinguished|fellow)\b/i
const SENIORITY_MID = /\b(senior|sr\.?|manager|engineer|developer)\b/i
const SENIORITY_JUNIOR = /\b(junior|jr\.?|intern|associate|entry|graduate|student)\b/i
const RECRUITER = /\b(recruiter|talent|acquisition|sourcing|hiring manager|people ops|hr)\b/i
const STUDENT = /\b(student|bootcamp|learning to code|self[- ]taught|career switch|aspiring)\b/i
const VENDOR_AGENCY = /\b(agency|consulting firm|freelance marketplace|dev shop|outsourcing)\b/i

const COMPANY_SIZE_PATTERNS: Array<{ pattern: RegExp; label: string; maturity: 'startup' | 'growth' | 'enterprise' }> = [
  { pattern: /\b(10,000\+?| fortune 500| enterprise|global (team|company|organization))\b/i, label: '10,000+', maturity: 'enterprise' },
  { pattern: /\b(1,000\+?| [0-9]{1,2},[0-9]{3}\+?)\b/i, label: '1,000+', maturity: 'enterprise' },
  { pattern: /\b([2-9][0-9]{2}\+?| [0-9]{3}\+?( employees)?)\b/i, label: '200+', maturity: 'growth' },
  { pattern: /\b([5-9][0-9]\+?| [0-9]{2}\+?( employees)?)\b/i, label: '50+', maturity: 'growth' },
  { pattern: /\b(([1-9]|[1-4][0-9])\+?| small (team|company))\b/i, label: '< 50', maturity: 'startup' },
]

const NEED_HIRING = /\b(hiring|open role|open position|joining our team|we're growing|we are growing| expanding the team|scaling the team|multiple open|several open)\b/i
const NEED_EXPANSION = /\b(launching|new product|new platform|rolling out|building out|scaling|migrating|rebuild|re[- ]?architect)\b/i
const NEED_AI = /\b(ai strategy|machine learning|llm integration|generative ai|ai product|ai feature|model deployment)\b/i
const NEED_INFRA = /\b(infrastructure|platform engineering|devops|reliability|migration|monolith|microservices|kubernetes)\b/i

/**
 * Main entry: score a pasted LinkedIn profile holistically.
 */
export function scoreProspect(input: ProspectIntelligenceInput): ProspectScore {
  const { extracted, bestSenderProof } = input
  const signals = collectSignals(input)
  const why: string[] = []
  const watchOut: string[] = []

  // ── Dimension 1: Person / relevance fit (0–20) ──
  const personDim = scorePersonFit(extracted, why, watchOut)

  // ── Dimension 2: Company fit (0–15) ──
  const companyDim = scoreCompanyFit(extracted, why, watchOut)

  // ── Dimension 3: Need / signal strength (0–20) ──
  const needDim = scoreNeedStrength(extracted, signals, why, watchOut)

  // ── Dimension 4: Sender capability / proof match (0–20) ──
  const senderDim = scoreSenderMatch(bestSenderProof, input.bestSender, why, watchOut)

  // ── Dimension 5: Timing (0–10) ──
  const timingDim = scoreTiming(extracted, signals)

  // ── Dimension 6: Evidence confidence (0–10) ──
  const confidenceDim = scoreEvidenceConfidence(extracted)

  // ── Dimension 7: Contact appropriateness (0–5) ──
  const accessDim = scoreContactAccess(extracted, why, watchOut)

  // ── Low confidence warning ──
  pushLowConfidenceWarning(extracted, watchOut)

  // ── Risk penalty ──
  const riskPenalty = computeRiskPenalty(extracted, why, watchOut)

  const dimensions: ScoreDimension[] = [
    { ...personDim, category: 'person' },
    { ...companyDim, category: 'company' },
    { ...needDim, category: 'need' },
    { ...senderDim, category: 'sender' },
    { ...timingDim, category: 'timing' },
    { ...confidenceDim, category: 'confidence' },
    { ...accessDim, category: 'access' },
  ]

  const subtotal = dimensions.reduce((s, d) => s + d.points, 0)
  const total = Math.max(0, Math.min(100, subtotal - riskPenalty))

  const recommendation = total >= 70 ? 'connect' : total >= 55 ? 'maybe' : 'skip'

  const evidenceConfidence = extracted.extractionConfidence ?? 50

  return {
    total,
    recommendation,
    dimensions,
    why: why.slice(0, 4),
    watchOut: watchOut.slice(0, 3),
    evidenceConfidence,
    signals,
  }
}

interface DimensionCore {
  key: string
  label: string
  points: number
  max: number
  note: string
}

function scorePersonFit(
  extracted: ExtractedLead,
  why: string[],
  watchOut: string[],
): DimensionCore {
  const title = extracted.titleRaw ?? extracted.title ?? ''
  const about = extracted.aboutSummary ?? ''
  const combined = `${title} ${about}`

  let points = 10
  let note = 'Moderate relevance based on role.'

  if (SENIORITY_DECISION.test(combined)) {
    points = 18
    note = 'Senior decision-maker — likely owns delivery or budget.'
    why.push(`${title || 'This person'} has decision-making seniority.`)
  } else if (SENIORITY_TECHNICAL_LEAD.test(combined)) {
    points = 15
    note = 'Technical lead — strong influence over tooling and partners.'
    why.push(`Technical leadership role with vendor influence.`)
  } else if (SENIORITY_MID.test(combined)) {
    points = 10
    note = 'Mid-level — may influence but not decide.'
  } else if (SENIORITY_JUNIOR.test(combined)) {
    points = 3
    note = 'Junior role — unlikely to make engagement decisions.'
    watchOut.push('Role suggests limited buying authority.')
  }

  if (RECRUITER.test(combined)) {
    points = Math.min(points, 5)
    note = 'Recruiter / talent — not a buyer of delivery services.'
    watchOut.push('Recruiter role: hiring for themselves, not a prospect for client work.')
  }

  if (STUDENT.test(combined)) {
    points = Math.min(points, 2)
    note = 'Student / career switcher — not a sales prospect.'
    watchOut.push('Appears to be a student or job seeker, not a buyer.')
  }

  if (VENDOR_AGENCY.test(combined)) {
    points = Math.min(points, 4)
    note = 'Works at an agency/vendor — likely a competitor or partner, not a buyer.'
    watchOut.push('May be a competitor or vendor, not a prospect.')
  }

  return { key: 'person', label: 'Person / relevance fit', points, max: 20, note }
}

function scoreCompanyFit(
  extracted: ExtractedLead,
  why: string[],
  watchOut: string[],
): DimensionCore {
  const combined = `${extracted.company} ${extracted.aboutSummary ?? ''} ${extracted.experienceSummary ?? ''}`
  let points = 8
  let note = 'Company context unclear — sparse profile.'

  for (const { pattern, label, maturity } of COMPANY_SIZE_PATTERNS) {
    if (pattern.test(combined)) {
      if (maturity === 'enterprise') {
        points = 13
        note = `Larger organization (${label}) — more complex, slower sales cycles.`
      } else if (maturity === 'growth') {
        points = 14
        note = `Growth-stage company (${label}) — likely has delivery pressure.`
        why.push(`Growth-stage company (${label}) with likely delivery needs.`)
      } else {
        points = 12
        note = `Small team (${label}) — may need external delivery help.`
        why.push(`Small organization (${label}) that may need external engineering support.`)
      }
      break
    }
  }

  const technical = /\b(software|platform|saas|app|product|engineering|developer|api|cloud|data|ai|ml)\b/i
  if (technical.test(combined) && points < 12) {
    points += 2
    note += ' Technical/product company.'
  }

  if (!extracted.company || extracted.company === 'Unknown company') {
    points = 2
    note = 'No company identified — major gap.'
    watchOut.push('No company name extracted from the profile.')
  }

  return { key: 'company', label: 'Company fit', points, max: 15, note }
}

function scoreNeedStrength(
  extracted: ExtractedLead,
  signals: ClassifiedSignal[],
  why: string[],
  watchOut: string[],
): DimensionCore {
  const combined = `${extracted.signalEvidence} ${extracted.aboutSummary ?? ''} ${extracted.verbatimQuote ?? ''}`
  let points = 5
  let note = 'No strong need signal detected.'

  const safeFacts = signals
    .filter((s) => s.mention === 'SAFE_TO_MENTION')
    .map((s) => s.label)

  if (NEED_HIRING.test(combined)) {
    points = 16
    note = 'Active hiring signal — team is growing or understaffed.'
    why.push('Actively hiring — suggests delivery demand.')
  } else if (NEED_EXPANSION.test(combined)) {
    points = 14
    note = 'Product/expansion signal — building new things.'
    why.push('Building or launching something new.')
  } else if (NEED_AI.test(combined)) {
    points = 15
    note = 'AI adoption signal — likely needs specialized help.'
    why.push('AI/ML work detected — specialized delivery need.')
  } else if (NEED_INFRA.test(combined)) {
    points = 13
    note = 'Infrastructure/platform signal — complex engineering work.'
    why.push('Platform or infrastructure work in progress.')
  }

  // Boost for explicit "asking" signal
  if (extracted.signalType === 7) {
    points = Math.max(points, 17)
    note = 'Publicly asking for help — strongest possible signal.'
    why.push('Publicly seeking external help.')
  }

  // Funding signal: internal relevance only, NOT safe to mention
  if (extracted.signalType === 3) {
    points = Math.max(points + 3, 12)
    note += ' Funding detected (internal signal).'
    // Do NOT add to "why" — funding is not a conversation starter
  }

  if (points < 8 && safeFacts.length === 0) {
    watchOut.push('No clear need signal from the profile.')
  }

  return { key: 'need', label: 'Need / signal strength', points, max: 20, note }
}

function scoreSenderMatch(
  bestSenderProof: MatchedProof[],
  bestSender: Profile | null,
  why: string[],
  watchOut: string[],
): DimensionCore {
  if (!bestSender) {
    return {
      key: 'sender',
      label: 'Sender / proof match',
      points: 0,
      max: 20,
      note: 'No outreach profiles available.',
    }
  }

  if (bestSenderProof.length === 0) {
    watchOut.push(`No verified proof matches for ${bestSender.label ?? 'the sender'}.`)
    return {
      key: 'sender',
      label: 'Sender / proof match',
      points: 4,
      max: 20,
      note: `${bestSender.label ?? 'Sender'} has no directly relevant proof for this prospect.`,
    }
  }

  const topScore = bestSenderProof[0].relevanceScore
  const strongProof = bestSenderProof.filter((p) => p.proofCard.strength === 'strong')

  let points = 8
  let note = `Some overlap between ${bestSender.label ?? 'sender'} and this prospect.`

  if (topScore >= 10 && strongProof.length > 0) {
    points = 19
    note = `Strong ${bestSender.label ?? 'sender'} proof directly relevant to this prospect.`
    why.push(`${bestSender.label ?? 'Sender'} has verified, relevant proof.`)
  } else if (topScore >= 7) {
    points = 15
    note = `Good ${bestSender.label ?? 'sender'} proof match.`
    why.push(`Relevant ${bestSender.label ?? 'sender'} experience aligns with this prospect.`)
  } else if (topScore >= 4) {
    points = 10
    note = `Moderate proof match for ${bestSender.label ?? 'sender'}.`
  } else {
    points = 6
    note = `Weak proof overlap — ${bestSender.label ?? 'sender'} may not feel credible here.`
    watchOut.push('Limited verified proof for this specific prospect.')
  }

  return { key: 'sender', label: 'Sender / proof match', points, max: 20, note }
}

function scoreTiming(
  extracted: ExtractedLead,
  signals: ClassifiedSignal[],
): DimensionCore {
  const combined = `${extracted.signalEvidence} ${extracted.verbatimQuote ?? ''}`
  let points = 5
  let note = 'No particular timing signal.'

  if (extracted.signalType === 7) {
    points = 9
    note = 'Asking for help now — immediate timing.'
  } else if (NEED_HIRING.test(combined)) {
    points = 7
    note = 'Currently hiring — relevant window.'
  } else if (extracted.signalType === 1) {
    points = 7
    note = 'Hiring signal suggests current need.'
  } else if (NEED_EXPANSION.test(combined)) {
    points = 6
    note = 'Building something — relevant time.'
  }

  // Do NOT fabricate urgency
  if (signals.some((s) => s.evidence === 'WEAK_SIGNAL')) {
    points = Math.min(points, 5)
    note = 'Timing unclear — no fabricated urgency.'
  }

  return { key: 'timing', label: 'Timing', points, max: 10, note }
}

function scoreEvidenceConfidence(
  extracted: ExtractedLead,
): DimensionCore {
  const confidence = extracted.extractionConfidence ?? 50
  const points = Math.round((confidence / 100) * 10)
  let note = ''

  if (confidence >= 80) note = 'High extraction confidence — rich profile.'
  else if (confidence >= 60) note = 'Moderate confidence — some fields thin.'
  else if (confidence >= 40) note = 'Low confidence — sparse or messy paste.'
  else note = 'Very low confidence — profile too thin to trust.'

  return { key: 'confidence', label: 'Evidence confidence', points, max: 10, note }
}

function pushLowConfidenceWarning(extracted: ExtractedLead, watchOut: string[]): void {
  const confidence = extracted.extractionConfidence ?? 50
  if (confidence < 50) {
    watchOut.push('Low extraction confidence — profile may be too sparse for reliable scoring.')
  }
}

function scoreContactAccess(
  extracted: ExtractedLead,
  why: string[],
  watchOut: string[],
): DimensionCore {
  const title = extracted.titleRaw ?? extracted.title ?? ''
  let points = 4
  let note = 'Reasonable person to contact.'

  if (SENIORITY_DECISION.test(title)) {
    points = 5
    note = 'Well-placed contact for an engagement discussion.'
  } else if (/\b(engineer|developer|designer|analyst|specialist)\b/i.test(title) && !SENIORITY_TECHNICAL_LEAD.test(title)) {
    points = 2
    note = 'Individual contributor — may not be the right contact for a vendor conversation.'
    watchOut.push('Individual contributor — consider whether a more senior person is the right contact.')
  } else if (!title) {
    points = 2
    note = 'No title — cannot assess contact appropriateness.'
    watchOut.push('No title extracted — cannot assess contact fit.')
  }

  if (RECRUITER.test(title)) {
    points = 1
    note = 'Recruiter — not the right contact for delivery services.'
  }

  return { key: 'access', label: 'Contact appropriateness', points, max: 5, note }
}

function computeRiskPenalty(
  extracted: ExtractedLead,
  _why: string[],
  watchOut: string[],
): number {
  let penalty = 0
  const title = extracted.titleRaw ?? extracted.title ?? ''
  const about = extracted.aboutSummary ?? ''

  if (STUDENT.test(`${title} ${about}`)) {
    penalty += 15
  }
  if (RECRUITER.test(`${title} ${about}`)) {
    penalty += 12
  }
  if (VENDOR_AGENCY.test(`${title} ${about}`)) {
    penalty += 10
  }

  if (!extracted.name) {
    penalty += 3
    watchOut.push('No name extracted — profile may be too sparse.')
  }
  if (!extracted.company || extracted.company === 'Unknown company') {
    penalty += 5
  }
  if ((extracted.extractionConfidence ?? 0) < 40) {
    penalty += 5
    watchOut.push('Very low extraction confidence — verify everything manually.')
  }

  return penalty
}

function collectSignals(input: ProspectIntelligenceInput): ClassifiedSignal[] {
  const { extracted } = input
  const signals: ClassifiedSignal[] = []
  const combined = `${extracted.signalEvidence} ${extracted.aboutSummary ?? ''} ${extracted.verbatimQuote ?? ''}`

  // Hiring signal
  if (NEED_HIRING.test(combined)) {
    const safe = classifyLeadFact('hiring', extracted.signalEvidence, 1)
    signals.push({
      label: 'Hiring activity',
      detail: extracted.signalEvidence.slice(0, 120) || 'Profile mentions hiring',
      evidence: 'VERIFIED_PROFILE',
      mention: safe.safeToMention ? 'SAFE_TO_MENTION' : 'INTERNAL_ONLY',
    })
  }

  // Funding signal — INTERNAL ONLY
  if (extracted.signalType === 3 || /\braised|funding|series|seed|investment\b/i.test(combined)) {
    signals.push({
      label: 'Funding signal',
      detail: 'Profile mentions funding activity',
      evidence: 'VERIFIED_PROFILE',
      mention: 'INTERNAL_ONLY',
    })
  }

  // Expansion signal
  if (NEED_EXPANSION.test(combined)) {
    signals.push({
      label: 'Expansion / build signal',
      detail: 'Building or launching something new',
      evidence: 'INFERRED',
      mention: 'SAFE_TO_MENTION',
    })
  }

  // AI adoption
  if (NEED_AI.test(combined)) {
    signals.push({
      label: 'AI / ML activity',
      detail: 'Profile references AI/ML work',
      evidence: 'VERIFIED_PROFILE',
      mention: 'SAFE_TO_MENTION',
    })
  }

  // Asking for help
  if (extracted.signalType === 7 || /\blooking for\b|\bneed help\b|\bseeking\b/i.test(combined)) {
    const safe = classifyLeadFact('asking for help', extracted.signalEvidence, 7)
    signals.push({
      label: 'Seeking help',
      detail: 'Publicly asking for external support',
      evidence: 'VERIFIED_PROFILE',
      mention: safe.safeToMention ? 'SAFE_TO_MENTION' : 'INTERNAL_ONLY',
    })
  }

  // Infrastructure work
  if (NEED_INFRA.test(combined)) {
    signals.push({
      label: 'Infrastructure / platform work',
      detail: 'Profile references platform or infrastructure engineering',
      evidence: 'INFERRED',
      mention: 'SAFE_TO_MENTION',
    })
  }

  // Generic / low-info risk
  if ((extracted.extractionConfidence ?? 0) < 50) {
    signals.push({
      label: 'Low extraction confidence',
      detail: 'Profile may be too sparse for reliable signals',
      evidence: 'UNKNOWN',
      mention: 'INTERNAL_ONLY',
    })
  }

  return signals
}
