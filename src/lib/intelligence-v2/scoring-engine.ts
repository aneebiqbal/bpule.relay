/**
 * Canonical Scoring Engine — relay_qualification_v2
 *
 * Produces one transparent 0-100 score. Code owns the score.
 * LongCat understands the evidence. Outcomes calibrate the model.
 *
 * Weights are centralized/versioned. Hard negatives may override.
 * Missing information reduces confidence, NOT automatically destroys score.
 */

import type {
  CanonicalScoreBreakdown,
  ScoreDimensionBreakdown,
  NormalizedIntelligence,
  RemoteEligibility,
  OpportunitySignal,
} from './types'
import { eligibilityScoreContribution, isJobSeekerAttribution } from './remote-eligibility'
import { isBuyerLeadership, isClinicianProfile, isRecruiterTitle } from './role-signals'

// ── Scoring Model Version ──────────────────────────────────────────────────

export const SCORE_VERSION = 'relay_qualification_v2'

// ── Dimension Weights (centralized, versioned) ────────────────────────────

export const DIMENSION_WEIGHTS = {
  opportunityFit: { max: 20, label: 'Opportunity Fit' },
  remoteEligibility: { max: 20, label: 'Remote Eligibility' },
  needIntent: { max: 20, label: 'Need / Intent' },
  revenueIdentityFit: { max: 15, label: 'Revenue Identity Fit' },
  proofStrength: { max: 10, label: 'Proof Strength' },
  accessReachability: { max: 5, label: 'Access / Reachability' },
  timing: { max: 5, label: 'Timing' },
  conversionEvidence: { max: 5, label: 'Conversion Evidence' },
} as const

// ── Hard Negatives ─────────────────────────────────────────────────────────

function splitCurrentEvidence(text: string): string {
  const pastMarkers = [
    /\nPAST EXPERIENCE\n/i,
    /\nPast Experience\n/i,
    /\nPAST PROJECTS\n/i,
    /\nPast Projects\n/i,
    /\nFreelance\n/i,
    /\nIndependent\n/i,
    /\nContract\n/i,
    /\nConsulting\n/i,
    /\nSide Projects\n/i,
  ]
  let earliest = text.length
  for (const marker of pastMarkers) {
    const match = text.match(marker)
    if (match && match.index !== undefined && match.index < earliest) {
      earliest = match.index
    }
  }
  return text.slice(0, earliest)
}

const HARD_NEGATIVE_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\b(on[- ]?site|onsite|in[- ]?person) (?:required|only|at our|in our)\b/i, reason: 'Explicitly on-site only at a non-Pakistan location' },
  { pattern: /\b(must be (?:based|located|resident) (?:in|at) (?:the )?(?:us|usa|united states|uk|united kingdom|canada|australia|germany))\b/i, reason: 'Explicit geography exclusion for Pakistan-based workers' },
  { pattern: /\b(eu only|european union only|eea only)\b/i, reason: 'Restricted to EU/EEA workers' },
  { pattern: /\bno (?:remote|offsite|telecommute|work from home)\b/i, reason: 'Explicitly not remote' },
]

// Job seeker markers — when present, geography patterns are PREFERENCES not restrictions
const JOB_SEEKER_MARKERS_PATTERN = /\b(open to work|looking for (?:a |remote | )?(?:job|role|position|opportunity|work|employment)|seeking (?:a |remote | )?(?:job|role|position|opportunity)|#OpenToWork|available for (?:freelance|contract|remote)|available for hire|looking to (?:join|work|relocate))\b/i

export function checkHardNegatives(text: string, isJobSeekerContext?: boolean): string[] {
  const negatives: string[] = []

  // Scope hard negatives to current evidence only. Historical experience
  // (past roles, old freelance budgets) must not create current restrictions.
  const currentOnly = splitCurrentEvidence(text)

  // Only check geography hard negatives if NOT a job seeker context
  // Job seeker saying "Open to work in UK" != employer restricting to UK
  if (!isJobSeekerContext) {
    for (const { pattern, reason } of HARD_NEGATIVE_PATTERNS) {
      if (pattern.test(currentOnly)) {
        negatives.push(reason)
      }
    }
  }

  // Exclude $15M, $1.2B, etc. — only match actual small budgets like $15, $300
  const lowBudgetMatch = currentOnly.match(/\$\s*(\d{1,4})(?![\d.MBK])/i)
  const lowBudget = lowBudgetMatch ? Number(lowBudgetMatch[1]) : null
  const hugeScope = /\b(uber|clone|exactly like|everything|full app|entire platform|all features)\b/i.test(currentOnly)
  const abandonedSignal = /\b(previous developer).{0,40}(disappeared|vanished|left)|\babandoned project\b|\bdon't have (?:the )?full requirements\b|\bno full requirements\b/i.test(currentOnly)
  const proposalOverload = /\bproposals?:\s*(\d{2,3})\b/i.exec(currentOnly)
  const proposalCount = proposalOverload ? Number(proposalOverload[1]) : null

  if (lowBudget !== null && lowBudget <= 300 && hugeScope) {
    negatives.push(`Budget ${lowBudget} with oversized scope request`)
  }
  if (abandonedSignal) {
    negatives.push('Abandoned handoff with missing requirements')
  }
  if (lowBudget !== null && lowBudget <= 300 && proposalCount !== null && proposalCount >= 20) {
    negatives.push(`Low-budget/high-competition lead (${lowBudget}, ${proposalCount} proposals)`)
  }

  return negatives
}

/**
 * Detect if the text is from a job seeker (not an employer).
 * Job seeker geography preferences must NOT be treated as employer restrictions.
 * Delegates to the attribution-aware checker so audience language ("anyone
 * looking for a job") does not misclassify a recruiter as a job seeker.
 */
export function isJobSeekerText(text: string): boolean {
  return isJobSeekerAttribution(text)
}

/**
 * Role quality penalty: students, recruiters, and non-buyers should score low.
 * Returns the number of points to subtract from the total.
 * Checks both extracted fields AND raw text for robustness against AI extraction variance.
 */
function computeRolePenalty(intelligence: NormalizedIntelligence, watchOut: string[], rawText?: string): number {
  const title = (intelligence.person.title ?? '').toLowerCase()
  const seniority = (intelligence.person.seniority ?? '').toLowerCase()
  const extractedContent = `${title} ${seniority} ${intelligence.content.topics.join(' ')} ${intelligence.company.name ?? ''}`.toLowerCase()
  const raw = (rawText ?? '').toLowerCase()
  const allContent = `${extractedContent} ${raw}`

  let penalty = 0

  // Student / job seeker
  // IMPORTANT: "looking for a developer/engineer/team" = HIRING, not job seeking
  // Only flag when the person is looking for THEIR OWN job/opportunity
  const jobSeekingPatterns = /\b(looking for (?:internship|job|work|opportunities|employment| a role| a position| remote role|full[- ]time work)|#opentowork|open to (?:new )?opportunities|seeking (?:a |new )?(?:job|role|position|opportunity|employment)|available for (?:new )?(?:job|role|position|opportunity))\b/i
  const hiringPatterns = /\b(looking for (?:a |an |the )?(?:developer|engineer|designer|team|cto|co[- ]?founder|partner|talent|candidate|hire))\b/i
  const isOperatingFounder = isBuyerLeadership(intelligence.person.title, intelligence.person.seniority)
  const isStudent = !isOperatingFounder
    && (jobSeekingPatterns.test(allContent) || /\b(student|intern(?:ship)?|bootcamp|learning to code|self[- ]taught|career switch|aspiring)\b/i.test(allContent))
    && !hiringPatterns.test(allContent)
  if (isStudent) {
    penalty += 35
    watchOut.push('Student / job seeker — not a buyer of development services')
  }

  if (isRecruiterTitle(intelligence.person.title)) {
    penalty += 30
    watchOut.push('Recruiter role: hiring for themselves, not a prospect for client work')
  } else if (isClinicianProfile(intelligence.person.title, intelligence.company.name, intelligence.company.industry)) {
    penalty += 30
    watchOut.push('Clinician / care practice — not a buyer of software delivery')
  } else if (intelligence.relationship === 'RECRUITER') {
    // Business-model detection (career-coaching / placement) caught this even
    // though the title alone isn't a recruiter title. Same penalty class.
    penalty += 30
    watchOut.push('Recruiter / career-services business: their hiring content describes their service, not a software-buying need.')
  }

  // Non-technical micro business — context-aware. A bare keyword match is
  // not enough: a security founder can say "I can hook up an electrical
  // outlet without being an electrician" as an analogy. Only flag when the
  // micro-business term appears alongside ownership/operation language
  // ("my plumbing business", "I run a bakery", "owner of...") suggesting it
  // IS the person's actual trade, OR in the profile header/title where it
  // describes the person's role — not buried in an analogy or third-party
  // reference deep in a post.
  const microBusinessTerms = /\b(plumb(?:er|ing)|electrician|baker|florist|bakery|restaurant|barber|salon|handyman|plumbing services)\b/i
  const microBusinessContextA = /\b(my |our |owner of |run a |i am a |i'm a |i was a |works? (?:as|for) |freelance |independent )\s{0,30}(?:plumb(?:er|ing)|electrician|baker|florist|bakery|restaurant|barber|salon|handyman)\b/i
  const microBusinessContextB = /\b(?:plumb(?:er|ing)|electrician|baker|florist|bakery|restaurant|barber|salon|handyman)\s{0,30}(?:business|company|shop|service|trade|practice)\b/i
  const isMicroBusiness = microBusinessContextA.test(allContent) || microBusinessContextB.test(allContent) || (
    microBusinessTerms.test(title) && !/\b(engineer|developer|software|cto|ceo|founder|product|security|ai|machine learning|data)\b/i.test(title)
  )
  if (isMicroBusiness) {
    penalty += 25
    watchOut.push('Non-technical micro business — unlikely to need software development')
  }

  // Company technicality — a small company is not automatically non-technical.
  // If the profile shows technical product/engineering evidence (building
  // software, AI systems, security research), override any "small = non-tech"
  // assumption. Company size and technicality are independent dimensions.
  const hasTechnicalProductEvidence = /\b(?:building|built|developing|developed|shipped|architecture|proprietary|engineering|software|ai system|machine learning|security research|code|platform|saas|api|agent)\b/i.test(allContent)
  if (isMicroBusiness && hasTechnicalProductEvidence) {
    // Downgrade: the person clearly does technical work despite a micro-business
    // keyword appearing (e.g. an analogy). Remove the penalty but keep a note.
    penalty -= 25
    watchOut.pop()
    watchOut.push('Profile contains a micro-business term but also strong technical product evidence — treating as technical.')
  }

  // Fraud risk — concrete suspicious behavior, not industry membership
  const isFraudRisk = /\b(pay(?:ing)? (?:in|with) (?:\$?crypto|\$?token|\$?btc|\$?eth)|\$\w+ (?:token|coin)|send (?:money|funds|payment) (?:before|upfront|first)|wire transfer only|no (?:contract|escrow|terms))\b/i.test(raw)
  if (isFraudRisk) {
    penalty += 30
    watchOut.push('Fraud risk — suspicious payment or contract behavior detected')
  }

  // Competitor agency / dev shop
  const isCompetitor = /\b(we are (?:a|an) (?:web |software |)?(?:development |dev )?agency|dev shop|outsourcing)\b/i.test(allContent) ||
    /\boverflow work\b/i.test(raw)
  if (isCompetitor && !/\bclient\b/i.test(title)) {
    penalty += 25
    watchOut.push('Competitor/vendor — likely a partner or subcontractor, not a buyer')
  }

  return penalty
}

// ── Main Scoring Function ──────────────────────────────────────────────────

export interface ScoreInput {
  intelligence: NormalizedIntelligence
  /** Raw text for hard-negative detection */
  rawText: string
  /** Whether we have relevant proof for this prospect */
  hasRelevantProof: boolean
  /** Strength of the best proof match (0-10) */
  proofMatchStrength: number
  /** Whether we have a credible Revenue Identity for this */
  hasCredibleIdentity: boolean
  /** Whether the contact is reachable (has LinkedIn, email, etc.) */
  isReachable: boolean
  /** Whether this resembles past wins */
  resemblesPastWin: boolean
  /** Past conversion signal if any */
  pastConversionSignal?: string | null
  /** Whether this is a job seeber profile (not employer) */
  isJobSeekerContext?: boolean
}

export function computeCanonicalScore(input: ScoreInput): CanonicalScoreBreakdown {
  const { intelligence, rawText } = input
  const dimensions: ScoreDimensionBreakdown[] = []
  const reasons: string[] = []
  const watchOut: string[] = []
  const missingInfo: string[] = []

  // Detect job seeker context if not explicitly provided
  const isJobSeeker = input.isJobSeekerContext ?? isJobSeekerText(rawText)

  // ── Check Hard Negatives ─────────────────────────────────────────────
  // Only check geography hard negatives if NOT a job seeker context
  const hardNegatives = checkHardNegatives(rawText, isJobSeeker)
  if (intelligence.remoteEligibility.eligibility === 'INELIGIBLE' && !isJobSeeker) {
    // Only treat remote eligibility as hard negative if not a job seeker
    // Job seeker "Open to work in UK" != employer restriction
    hardNegatives.push(intelligence.remoteEligibility.reason)
  }

  // ── Role Quality Check ───────────────────────────────────────────────
  // Non-buyers (students, recruiters, non-technical roles) should score low
  // regardless of technical content in their profile
  const rolePenalty = computeRolePenalty(intelligence, watchOut, rawText)
  if (rolePenalty > 0) {
    hardNegatives.push(`Non-buyer role: ${rolePenalty} point penalty`)
  }

  // ── Dimension 1: Opportunity Fit (0-20) ──────────────────────────────
  const oppDim = scoreOpportunityFit(intelligence, reasons, watchOut)
  dimensions.push(oppDim)

  // ── Dimension 2: Remote Eligibility (0-20) ───────────────────────────
  const remoteDim = scoreRemoteEligibility(intelligence.remoteEligibility, reasons, watchOut)
  dimensions.push(remoteDim)

  // ── Dimension 3: Need / Intent (0-20) ───────────────────────────────
  const needDim = scoreNeedIntent(intelligence, reasons, watchOut)
  dimensions.push(needDim)

  // ── Dimension 4: Revenue Identity Fit (0-15) ─────────────────────────
  const identityDim = scoreRevenueIdentityFit(input.hasCredibleIdentity, reasons, watchOut)
  dimensions.push(identityDim)

  // ── Dimension 5: Proof Strength (0-10) ───────────────────────────────
  const proofDim = scoreProofStrength(input.hasRelevantProof, input.proofMatchStrength, reasons, watchOut)
  dimensions.push(proofDim)

  // ── Dimension 6: Access / Reachability (0-5) ─────────────────────────
  const accessDim = scoreAccessReachability(input.isReachable, intelligence, reasons, watchOut)
  dimensions.push(accessDim)

  // ── Dimension 7: Timing (0-5) ────────────────────────────────────────
  const timingDim = scoreTiming(intelligence, reasons)
  dimensions.push(timingDim)

  // ── Dimension 8: Conversion Evidence (0-5) ───────────────────────────
  const convDim = scoreConversionEvidence(input.resemblesPastWin, input.pastConversionSignal ?? null, reasons)
  dimensions.push(convDim)

  // ── Compute Total ────────────────────────────────────────────────────
  let total = dimensions.reduce((sum, d) => sum + d.points, 0)

  // Apply role quality penalty (non-buyers score low regardless of technical content)
  total = Math.max(0, total - rolePenalty)

  // Apply hard negative override
  if (hardNegatives.length > 0) {
    total = Math.min(total, 25) // Hard cap when hard negatives present
  }

  // Clamp 0-100
  total = Math.max(0, Math.min(100, total))

  // ── Identify Missing Info ────────────────────────────────────────────
  if (!intelligence.person.fullName) missingInfo.push('Contact name unknown')
  if (!intelligence.company.name) missingInfo.push('Company name unknown')
  if (!intelligence.person.title) missingInfo.push('Role/title unknown')
  if (intelligence.opportunity.signals.length === 0) missingInfo.push('No clear opportunity signal')
  if (intelligence.remoteEligibility.eligibility === 'UNCLEAR') missingInfo.push('Remote eligibility unclear')

  return {
    dimensions,
    hardNegatives,
    missingInfo,
    total,
    label: scoreLabel(total),
    reasons: reasons.slice(0, 5),
    watchOut: watchOut.slice(0, 3),
  }
}

function scoreLabel(score: number): string {
  if (score >= 85) return 'Strong opportunity'
  if (score >= 70) return 'Worth pursuing'
  if (score >= 55) return 'Maybe — needs more signal'
  if (score >= 40) return 'Weak fit'
  return 'Not a fit'
}

// ── Individual Dimension Scorers ───────────────────────────────────────────

function scoreOpportunityFit(
  intelligence: NormalizedIntelligence,
  reasons: string[],
  watchOut: string[],
): ScoreDimensionBreakdown {
  const isNonBuyer =
    isRecruiterTitle(intelligence.person.title)
    || isClinicianProfile(intelligence.person.title, intelligence.company.name, intelligence.company.industry)
    || isClinicianProfile(null, intelligence.company.name, intelligence.company.industry)
    || intelligence.relationship === 'RECRUITER'
    || intelligence.relationship === 'POTENTIAL_PARTNER'
    || intelligence.relationship === 'PEER'
  if (isNonBuyer) {
    return {
      key: 'opportunityFit',
      label: DIMENSION_WEIGHTS.opportunityFit.label,
      points: 4,
      max: DIMENSION_WEIGHTS.opportunityFit.max,
      note: 'This profile is not buying software delivery.',
      direction: 'negative',
    }
  }
  const signals = intelligence.opportunity.signals
  const content = intelligence.content

  let points = 5 // Baseline: some opportunity exists
  let note = 'No clear opportunity match.'

  // Strong service match signals
  const strongSignals: OpportunitySignal[] = ['hiring', 'freelance_project_need', 'explicit_ask', 'technical_problem']
  const hasStrong = signals.some((s) => strongSignals.includes(s))

  if (hasStrong) {
    points = 16
    note = `Strong opportunity signal: ${signals.join(', ')}.`
    reasons.push(`Strong opportunity signal: ${signals[0]}.`)
  } else if (signals.includes('hiring_pressure')) {
    points = 14
    note = 'Hiring pressure detected — delivery need likely.'
    reasons.push('Hiring pressure suggests delivery need.')
  } else if (signals.includes('growth_signal') && intelligence.commercialReading?.externalEngineeringNeed !== 'NONE_DETECTED') {
    points = 12
    note = 'Growth signal — may have expanding needs.'
    // Deliberately hedged: "company is growing/scaling" is the observed
    // evidence. "Therefore they need our software services" is an
    // inference, not a fact — do not state it as established. See
    // BUG_LEDGER REL-FUNC-01x (Daria Redkina / Solsonic hardening fixture).
    reasons.push('Company growth signal — a possible but unconfirmed need, not a verified requirement.')
  } else if (signals.includes('funding')) {
    points = 11
    note = 'Funding signal — resources available, needs unclear.'
  } else if (signals.includes('launch')) {
    points = 13
    note = 'Launch/initiative in progress — delivery need possible.'
    reasons.push('Active launch/initiative detected.')
  } else if (signals.includes('migration') || signals.includes('rebuild')) {
    points = 14
    note = 'Migration/rebuild — complex engineering work.'
    reasons.push('Migration or rebuild work detected.')
  }

  // Boost for technical signals in content
  if (content.technicalSignals.length > 0 && points < 16) {
    points = Math.min(points + 2, 18)
    note += ' Technical work confirmed.'
  }

  // Penalty for unclear opportunity
  if (signals.length === 0 && content.technicalSignals.length === 0) {
    points = 4
    note = 'No clear opportunity signal from available evidence.'
    watchOut.push('No clear opportunity signal detected.')
  }

  return {
    key: 'opportunityFit',
    label: DIMENSION_WEIGHTS.opportunityFit.label,
    points: Math.min(points, DIMENSION_WEIGHTS.opportunityFit.max),
    max: DIMENSION_WEIGHTS.opportunityFit.max,
    note,
    direction: points >= 12 ? 'positive' : points >= 6 ? 'neutral' : 'negative',
  }
}

function scoreRemoteEligibility(
  eligibility: RemoteEligibility,
  reasons: string[],
  watchOut: string[],
): ScoreDimensionBreakdown {
  const contribution = eligibilityScoreContribution(eligibility)
  const max = DIMENSION_WEIGHTS.remoteEligibility.max
  const points = Math.max(0, Math.min(max, contribution))

  const note = eligibility.reason

  if (eligibility.eligibility === 'ELIGIBLE') {
    reasons.push(`Remote compatible: ${eligibility.reason}`)
  } else if (eligibility.eligibility === 'LIKELY_ELIGIBLE') {
    reasons.push(`Likely remote compatible: ${eligibility.reason}`)
  } else if (eligibility.eligibility === 'INELIGIBLE') {
    watchOut.push(`Remote barrier: ${eligibility.reason}`)
  } else if (eligibility.eligibility === 'NOT_APPLICABLE') {
    // NOT_APPLICABLE means there is no job/engagement being evaluated at all
    // (e.g. a recruiter or networking contact) — this is a neutral, expected
    // state, not a concern. It must never be worded as "unclear", which
    // implies missing information about a real opportunity. See Bug 3 —
    // remote-eligibility NOT_APPLICABLE mislabeling hardening.
    reasons.push(`Remote eligibility not applicable: ${eligibility.reason}`)
  } else {
    watchOut.push(`Remote eligibility unclear: ${eligibility.reason}`)
  }

  return {
    key: 'remoteEligibility',
    label: DIMENSION_WEIGHTS.remoteEligibility.label,
    points,
    max,
    note,
    direction: contribution > 0 ? 'positive' : contribution < 0 ? 'negative' : 'neutral',
  }
}

function scoreNeedIntent(
  intelligence: NormalizedIntelligence,
  reasons: string[],
  watchOut: string[],
): ScoreDimensionBreakdown {
  const isNonBuyerNeed =
    isRecruiterTitle(intelligence.person.title)
    || isClinicianProfile(intelligence.person.title, intelligence.company.name, intelligence.company.industry)
    || isClinicianProfile(null, intelligence.company.name, intelligence.company.industry)
    || intelligence.relationship === 'RECRUITER'
    || intelligence.relationship === 'POTENTIAL_PARTNER'
    || intelligence.relationship === 'PEER'
  if (isNonBuyerNeed) {
    return {
      key: 'needIntent',
      label: DIMENSION_WEIGHTS.needIntent.label,
      points: 3,
      max: DIMENSION_WEIGHTS.needIntent.max,
      note: 'No software-delivery need on this profile.',
      direction: 'negative',
    }
  }
  const opportunity = intelligence.opportunity
  let points = 4
  let note = 'No strong need signal.'

  if (opportunity.urgency === 'immediate' && intelligence.commercialReading?.immediateBuyerNeed !== false) {
    points = 18
    note = 'Immediate need — strong timing.'
    reasons.push('Immediate need detected.')
  } else if (opportunity.signals.includes('explicit_ask')) {
    points = 19
    note = 'Publicly asking for help — strongest signal.'
    reasons.push('Explicitly seeking external help.')
  } else if (opportunity.signals.includes('hiring')) {
    points = 16
    note = 'Active hiring — delivery demand.'
    reasons.push('Actively hiring.')
  } else if (opportunity.signals.includes('freelance_project_need')) {
    points = 17
    note = 'Freelance/project need — direct opportunity.'
    reasons.push('Freelance/project need detected.')
  } else if (opportunity.signals.includes('technical_problem')) {
    points = 15
    note = 'Technical problem — may need specialized help.'
    reasons.push('Technical challenge identified.')
  } else if (opportunity.urgency === 'near_term') {
    points = 12
    note = 'Near-term need — relevant window.'
  } else if (opportunity.urgency === 'future') {
    points = 8
    note = 'Future need — timing unclear.'
  }

  // Boost for content signals
  if (intelligence.content.hiringSignals.length > 0) {
    points = Math.min(points + 2, 19)
  }

  if (points < 8) {
    watchOut.push('No clear need signal from evidence.')
  }

  return {
    key: 'needIntent',
    label: DIMENSION_WEIGHTS.needIntent.label,
    points: Math.min(points, DIMENSION_WEIGHTS.needIntent.max),
    max: DIMENSION_WEIGHTS.needIntent.max,
    note,
    direction: points >= 12 ? 'positive' : points >= 6 ? 'neutral' : 'negative',
  }
}

function scoreRevenueIdentityFit(
  hasCredibleIdentity: boolean,
  reasons: string[],
  watchOut: string[],
): ScoreDimensionBreakdown {
  let points = 5
  let note = 'No matching Revenue Identity.'

  // Wording note (Bug 4.3): this dimension purely reflects "we could route
  // this to a sender if outreach were needed" — it does not and must not
  // imply a commercial opportunity has been established. "Compatible" avoids
  // the earlier "for this opportunity" phrasing, which contradicted a
  // simultaneous "no clear opportunity signal detected" watchOut on the same
  // profile. This is a wording-only change — hasCredibleIdentity still only
  // feeds this dimension's own points, never oppFit/needIntent.
  if (hasCredibleIdentity) {
    points = 13
    note = 'Compatible Revenue Identity available.'
    reasons.push('Compatible Revenue Identity available for outreach, if needed.')
  } else {
    // This is informational, not necessarily a concern — whether it matters
    // depends on whether any outreach message is actually planned, which
    // this scoring dimension has no visibility into (that is decided later,
    // in the revenue-strategy layer, from qualification + action). Route.ts
    // and the UI are responsible for suppressing/rewording this watchOut
    // when the recommended action carries no pitch — see Bug 4 (route.ts
    // sender/proof gating).
    watchOut.push('No Revenue Identity identified for this opportunity.')
  }

  return {
    key: 'revenueIdentityFit',
    label: DIMENSION_WEIGHTS.revenueIdentityFit.label,
    points: Math.min(points, DIMENSION_WEIGHTS.revenueIdentityFit.max),
    max: DIMENSION_WEIGHTS.revenueIdentityFit.max,
    note,
    direction: hasCredibleIdentity ? 'positive' : 'neutral',
  }
}

function scoreProofStrength(
  hasRelevantProof: boolean,
  matchStrength: number,
  reasons: string[],
  watchOut: string[],
): ScoreDimensionBreakdown {
  let points = 2
  let note = 'No verified proof available.'

  if (hasRelevantProof && matchStrength >= 8) {
    points = 9
    note = 'Strong verified proof directly relevant to this opportunity.'
    reasons.push('Strong verified proof matches this opportunity.')
  } else if (hasRelevantProof && matchStrength >= 5) {
    points = 6
    note = 'Relevant proof available for this opportunity.'
    reasons.push('Relevant proof on file.')
  } else if (hasRelevantProof) {
    points = 4
    note = 'Some proof available but weak match.'
  } else {
    watchOut.push('No verified proof for this specific opportunity.')
  }

  return {
    key: 'proofStrength',
    label: DIMENSION_WEIGHTS.proofStrength.label,
    points: Math.min(points, DIMENSION_WEIGHTS.proofStrength.max),
    max: DIMENSION_WEIGHTS.proofStrength.max,
    note,
    direction: points >= 6 ? 'positive' : points >= 3 ? 'neutral' : 'negative',
  }
}

function scoreAccessReachability(
  isReachable: boolean,
  intelligence: NormalizedIntelligence,
  reasons: string[],
  watchOut: string[],
): ScoreDimensionBreakdown {
  let points = 2
  let note = 'Reachability unclear.'

  if (isReachable && intelligence.person.linkedinUrl) {
    points = 5
    note = 'Direct LinkedIn route available.'
    reasons.push('Direct LinkedIn contact route.')
  } else if (isReachable) {
    points = 3
    note = 'Some contact route identified.'
  } else {
    watchOut.push('No clear route to contact this person.')
  }

  return {
    key: 'accessReachability',
    label: DIMENSION_WEIGHTS.accessReachability.label,
    points: Math.min(points, DIMENSION_WEIGHTS.accessReachability.max),
    max: DIMENSION_WEIGHTS.accessReachability.max,
    note,
    direction: isReachable ? 'positive' : 'neutral',
  }
}

function scoreTiming(
  intelligence: NormalizedIntelligence,
  reasons: string[],
): ScoreDimensionBreakdown {
  let points = 3
  let note = 'Timing signal unclear.'

  if (intelligence.opportunity.urgency === 'immediate' && intelligence.commercialReading?.immediateBuyerNeed !== false) {
    points = 5
    note = 'Immediate timing — act now.'
    reasons.push('Immediate timing signal.')
  } else if (intelligence.opportunity.urgency === 'near_term') {
    points = 4
    note = 'Near-term window — relevant soon.'
  } else if (intelligence.content.hiringSignals.length > 0) {
    points = 4
    note = 'Recent activity indicates current relevance.'
  }

  // Weak signal penalty (don't fabricate urgency)
  if (intelligence.content.topics.length === 0 && intelligence.opportunity.urgency === 'unknown') {
    points = 2
    note = 'No timing signal — no fabricated urgency.'
  }

  return {
    key: 'timing',
    label: DIMENSION_WEIGHTS.timing.label,
    points: Math.min(points, DIMENSION_WEIGHTS.timing.max),
    max: DIMENSION_WEIGHTS.timing.max,
    note,
    direction: points >= 4 ? 'positive' : 'neutral',
  }
}

function scoreConversionEvidence(
  resemblesPastWin: boolean,
  pastConversionSignal: string | null,
  reasons: string[],
): ScoreDimensionBreakdown {
  let points = 2
  let note = 'No direct conversion evidence.'

  if (resemblesPastWin) {
    points = 5
    note = 'Resembles opportunities we have actually won.'
    reasons.push('Pattern matches past successful conversions.')
  } else if (pastConversionSignal) {
    points = 4
    note = `Past conversion signal: ${pastConversionSignal}.`
  }

  return {
    key: 'conversionEvidence',
    label: DIMENSION_WEIGHTS.conversionEvidence.label,
    points: Math.min(points, DIMENSION_WEIGHTS.conversionEvidence.max),
    max: DIMENSION_WEIGHTS.conversionEvidence.max,
    note,
    direction: points >= 4 ? 'positive' : 'neutral',
  }
}
