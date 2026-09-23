/**
 * Intelligence Orchestrator
 *
 * Ties the full pipeline together:
 *   Raw Input → Multi-Pass Extraction → Completeness Gate → Canonical Score → Canonical Prospect Intelligence
 *
 * This is the single entry point for producing the canonical persisted
 * intelligence object. Once produced, the score is immutable unless
 * re-scored through the proper channel.
 */

import type {
  CanonicalProspectIntelligence,
  EvidenceEntry,
} from './types'
import { scoreLabel } from './types'
import { runIntelligencePipeline, type ExtractionPipelineOptions, type ExtractionPipelineResult } from './extraction-pipeline'
import { assessExtractionCompleteness, repairExtraction, evaluateCompletenessGate } from './completeness-gate'
import { computeCanonicalScore, SCORE_VERSION, type ScoreInput } from './scoring-engine'
import { isNonBuyerProfessional, isLinkedInChromeText } from './role-signals'
import { buildIntelligenceInputHash, INTELLIGENCE_PIPELINE_VERSION } from './input-hash'

// ── Orchestrator Options ───────────────────────────────────────────────────

export interface OrchestratorOptions extends ExtractionPipelineOptions {
  onStatus?: (message: string) => void
  /** Whether to attempt auto-repair on weak extraction */
  autoRepair?: boolean
  /** Whether we have relevant proof for this prospect */
  hasRelevantProof?: boolean
  /** Strength of best proof match (0-10) */
  proofMatchStrength?: number
  /** Whether we have a credible Revenue Identity */
  hasCredibleIdentity?: boolean
  /** Whether the contact is reachable */
  isReachable?: boolean
  /** Whether this resembles past wins */
  resemblesPastWin?: boolean
  /** Past conversion signal */
  pastConversionSignal?: string | null
  /** Recommended Revenue Identity ID */
  recommendedIdentityId?: string | null
  /** Recommended proof IDs */
  recommendedProofIds?: string[]
  /** When true, AI failures are not silently replaced by deterministic fallback extraction */
  strictLiveMode?: boolean
  /**
   * Input-hash reuse (Phase 6 — stable input hashing). When provided, the
   * orchestrator computes the deterministic input hash for `rawText` and
   * calls this BEFORE running any AI extraction. If it returns a persisted
   * canonical intelligence result, that result is returned as-is (with
   * `reused: true`) instead of re-invoking the pipeline — same input + same
   * versions => a refresh/re-paste/retry never triggers new business truth.
   *
   * The caller owns the actual lookup (e.g. a Supabase query scoped to the
   * caller's organization) — the orchestrator has no store/DB dependency by
   * design, so it stays usable from scripts/tests without a live database.
   * Only pass a result whose `intelligenceVersion`/`scoreVersion` you have
   * already confirmed still match current versions — the orchestrator does
   * one last version check itself as a safety net, but the lookup should not
   * rely on that alone (e.g. don't look up leads from other organizations).
   */
  reuseIfUnchanged?: (inputHash: string) => Promise<CanonicalProspectIntelligence | null> | (CanonicalProspectIntelligence | null)
  /** Explicit user-requested re-analysis — skips reuseIfUnchanged even if a matching hash exists. Always creates a new run, and (when the caller records rescore history) should be traceable as `trigger: 'user_requested'`. */
  forceReanalyze?: boolean
}

export interface OrchestratorResult {
  intelligence: CanonicalProspectIntelligence
  /** Whether the extraction passed the completeness gate */
  gatePassed: boolean
  /** Notes from the completeness gate */
  gateNotes: string[]
  /** Whether auto-repair was attempted */
  repairAttempted: boolean
  /** Whether auto-repair improved the extraction */
  repairImproved: boolean
  /** True when this result was reused from a prior run via reuseIfUnchanged rather than freshly computed */
  reused: boolean
}

// ── Main Orchestrator ──────────────────────────────────────────────────────

export async function produceCanonicalIntelligence(
  rawText: string,
  opts: OrchestratorOptions = {},
): Promise<OrchestratorResult> {
  const autoRepair = opts.autoRepair !== false // Default true
  const trace: Array<{ stage: string; ms: number; provider?: string }> = []
  const t0 = Date.now()

  opts.onStatus?.('Analyzing prospect')

  // Step 0: Input qualification gate - classify before extraction
  const { classifyInput } = await import('@/lib/prospect/qualification-gate')
  const inputClassification = classifyInput(rawText)

  if (inputClassification.classification === 'IRRELEVANT') {
    // IRRELEVANT_OR_INSUFFICIENT: no score, no Pass C, no invented prospect
    return {
      intelligence: createIrrelevantIntelligence(rawText, inputClassification),
      gatePassed: false,
      gateNotes: inputClassification.reasons,
      repairAttempted: false,
      repairImproved: false,
      reused: false,
    }
  }

  // Step 0.5: Input-hash reuse check (Phase 6) — BEFORE any AI call.
  // Same normalized input + same pipeline/score versions => reuse the
  // persisted result instead of re-extracting. Skipped entirely when the
  // caller explicitly requests reanalysis (Force Reanalyze).
  const inputHash = buildIntelligenceInputHash({ rawText })
  if (opts.reuseIfUnchanged && !opts.forceReanalyze) {
    opts.onStatus?.('Checking for existing intelligence')
    const reusable = await opts.reuseIfUnchanged(inputHash)
    if (
      reusable
      && reusable.intelligenceInputHash === inputHash
      && reusable.intelligenceVersion === INTELLIGENCE_PIPELINE_VERSION
      && reusable.scoreVersion === SCORE_VERSION
    ) {
      opts.onStatus?.(`Reusing existing intelligence — score ${reusable.canonicalScore}/100 (${reusable.scoreBreakdown.label})`)
      return {
        intelligence: reusable,
        gatePassed: true,
        gateNotes: ['Reused persisted canonical intelligence — unchanged input, same versions.'],
        repairAttempted: false,
        repairImproved: false,
        reused: true,
      }
    }
  }

  // Step 1: Run multi-pass extraction pipeline
  const tPipeline = Date.now()
  const pipelineResult: ExtractionPipelineResult = await runIntelligencePipeline(rawText, opts)
  trace.push({ stage: 'pipeline_total', ms: Date.now() - tPipeline })
  for (const entry of pipelineResult.callLog) {
    trace.push({ stage: entry.task, ms: entry.latencyMs, provider: entry.provider })
  }

  // Step 2: Assess extraction completeness
  opts.onStatus?.('Validating intelligence')
  const tComplete = Date.now()
  let completeness = assessExtractionCompleteness({
    intelligence: pipelineResult.intelligence,
    rawSource: pipelineResult.rawSource,
    sourceUrls: pipelineResult.sourceUrls,
  })
  trace.push({ stage: 'completeness_check', ms: Date.now() - tComplete })

  // Step 3: Evaluate completeness gate
  let gateDecision = evaluateCompletenessGate(completeness)

  // Step 4: Auto-repair only on critical failure (score < 40 or cannot proceed)
  let repairAttempted = false
  let repairImproved = false
  let intelligence = pipelineResult.intelligence

  if (autoRepair && (!gateDecision.canProceed || completeness.score < 40)) {
    opts.onStatus?.('Improving intelligence')
    repairAttempted = true
    const tRepair = Date.now()

    const repairResult = await repairExtraction(
      rawText,
      intelligence,
      completeness,
    )
    trace.push({ stage: 'repair', ms: Date.now() - tRepair })

    if (repairResult.repaired) {
      intelligence = repairResult.intelligence
      completeness = repairResult.completeness
      repairImproved = true
      gateDecision = evaluateCompletenessGate(completeness)
    }
  }

  // Step 5: Compute canonical score
  opts.onStatus?.('Computing canonical score')
  const tScore = Date.now()

  const inferredHasRelevantProof =
    opts.hasRelevantProof
    ?? inferProofAvailability(intelligence)
  const inferredProofStrength =
    opts.proofMatchStrength
    ?? inferProofStrength(intelligence, inferredHasRelevantProof)
  const inferredHasCredibleIdentity =
    opts.hasCredibleIdentity
    ?? inferCredibleIdentity(intelligence)
  const inferredResemblesPastWin =
    opts.resemblesPastWin
    ?? inferPastWinResemblance(intelligence)

  const scoreInput: ScoreInput = {
    intelligence,
    rawText,
    hasRelevantProof: inferredHasRelevantProof,
    proofMatchStrength: inferredProofStrength,
    hasCredibleIdentity: inferredHasCredibleIdentity,
    isReachable: opts.isReachable ?? Boolean(intelligence.person.linkedinUrl || pipelineResult.sourceUrls.length > 0),
    resemblesPastWin: inferredResemblesPastWin,
    pastConversionSignal: opts.pastConversionSignal ?? null,
  }

  const scoreBreakdown = computeCanonicalScore(scoreInput)
  trace.push({ stage: 'scoring', ms: Date.now() - tScore })

  // Step 6: Build evidence ledger (merge pipeline + scoring evidence)
  const evidenceLedger: EvidenceEntry[] = [
    ...pipelineResult.evidenceLedger,
    ...buildScoringEvidence(scoreBreakdown),
  ]

  // Step 7: Build outreach context
  const outreachContext = buildOutreachContext(intelligence, scoreBreakdown, pipelineResult)

  // Step 8: Assemble the canonical intelligence object
  const qualification = scoreLabel(scoreBreakdown.total).qualification

  trace.push({ stage: 'total', ms: Date.now() - t0 })
  console.info(`[ai/trace] ${trace.map((t) => `${t.stage}=${t.ms}ms${t.provider ? `(${t.provider})` : ''}`).join(' → ')}`)

  const canonical: CanonicalProspectIntelligence = {
    version: SCORE_VERSION,
    intelligenceRunId: crypto.randomUUID(),
    intelligenceInputHash: inputHash,
    intelligenceVersion: INTELLIGENCE_PIPELINE_VERSION,
    computedAt: new Date().toISOString(),
    canonicalScore: scoreBreakdown.total,
    scoreVersion: SCORE_VERSION,
    scoredAt: new Date().toISOString(),
    scoreBreakdown,
    confidence: completeness.score,
    qualification,
    intelligence,
    rawSource: pipelineResult.rawSource,
    evidenceLedger,
    remoteEligibility: pipelineResult.remoteEligibility,
    extractionCompleteness: completeness,
    rescoreEvents: [],
    recommendedIdentityId: opts.recommendedIdentityId ?? null,
    recommendedProofIds: opts.recommendedProofIds ?? [],
    personalizationAngle: buildPersonalizationAngle(intelligence),
    outreachContext,
    extractionCallLog: pipelineResult.callLog,
    extractionTrace: trace,
  }

  opts.onStatus?.(`Complete — score ${scoreBreakdown.total}/100 (${scoreBreakdown.label})`)

  return {
    intelligence: canonical,
    gatePassed: gateDecision.canProceed,
    gateNotes: gateDecision.notes,
    repairAttempted,
    repairImproved,
    reused: false,
  }
}

function isNonBuyerIntel(intelligence: import('./types').NormalizedIntelligence): boolean {
  if (
    intelligence.relationship === 'RECRUITER'
    || intelligence.relationship === 'POTENTIAL_PARTNER'
    || intelligence.relationship === 'PEER'
  ) {
    return true
  }
  return isNonBuyerProfessional({
    title: intelligence.person.title,
    company: intelligence.company.name,
    industry: intelligence.company.industry,
  })
}

function inferProofAvailability(
  intelligence: import('./types').NormalizedIntelligence,
): boolean {
  if (isNonBuyerIntel(intelligence)) return false
  if (intelligence.content.technicalSignals.length >= 2) return true
  if (intelligence.opportunity.signals.includes('technical_problem')) return true
  if (intelligence.opportunity.signals.includes('migration')) return true
  if (intelligence.opportunity.signals.includes('rebuild')) return true
  if (intelligence.opportunity.signals.includes('freelance_project_need') && intelligence.content.technicalSignals.length >= 1) {
    return true
  }
  return false
}

function inferProofStrength(
  intelligence: import('./types').NormalizedIntelligence,
  hasProof: boolean,
): number {
  if (!hasProof) return 0
  const techCount = intelligence.content.technicalSignals.length
  if (techCount >= 5) return 8
  if (techCount >= 3) return 7
  if (techCount >= 2) return 6
  return 5
}

function inferCredibleIdentity(
  intelligence: import('./types').NormalizedIntelligence,
): boolean {
  if (isNonBuyerIntel(intelligence)) return false
  const title = (intelligence.person.title ?? '').toLowerCase()
  if (/\b(founder|ceo|cto|coo|chief|vp|head|director|owner|president)\b/.test(title)) {
    return true
  }

  const hasNamedDecisionMaker =
    Boolean(intelligence.person.fullName)
    && (
      intelligence.opportunity.signals.includes('explicit_ask')
      || intelligence.opportunity.signals.includes('freelance_project_need')
      || intelligence.opportunity.signals.includes('hiring')
    )
  if (hasNamedDecisionMaker) return true

  return false
}

function inferPastWinResemblance(
  intelligence: import('./types').NormalizedIntelligence,
): boolean {
  if (isNonBuyerIntel(intelligence)) return false
  const signals = intelligence.opportunity.signals
  const hasBuyingSignal =
    signals.includes('explicit_ask')
    || signals.includes('freelance_project_need')
    || signals.includes('technical_problem')
    || signals.includes('hiring')
  return hasBuyingSignal && intelligence.content.technicalSignals.length > 0
}

// ── Re-score Function ──────────────────────────────────────────────────────

export interface RescoreOptions {
  trigger: 'source_changed' | 'user_requested' | 'model_version_changed' | 'new_signal'
  reason: string
  /** New raw text if source changed */
  newRawText?: string
  /** Updated proof match info */
  hasRelevantProof?: boolean
  proofMatchStrength?: number
  /** Updated identity info */
  hasCredibleIdentity?: boolean
}

export function rescoreIntelligence(
  existing: CanonicalProspectIntelligence,
  newScoreBreakdown: ReturnType<typeof computeCanonicalScore>,
  options: RescoreOptions,
): CanonicalProspectIntelligence {
  const rescoreEvent = {
    fromScore: existing.canonicalScore,
    toScore: newScoreBreakdown.total,
    reason: options.reason,
    version: existing.scoreVersion,
    timestamp: new Date().toISOString(),
    trigger: options.trigger,
  }

  const qualification = scoreLabel(newScoreBreakdown.total).qualification

  return {
    ...existing,
    canonicalScore: newScoreBreakdown.total,
    scoredAt: new Date().toISOString(),
    scoreBreakdown: newScoreBreakdown,
    qualification,
    rescoreEvents: [...existing.rescoreEvents, rescoreEvent],
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildScoringEvidence(scoreBreakdown: ReturnType<typeof computeCanonicalScore>): EvidenceEntry[] {
  const entries: EvidenceEntry[] = []
  for (const dim of scoreBreakdown.dimensions) {
    if (dim.points > 0 && dim.direction === 'positive') {
      entries.push({
        signal: dim.label,
        source: 'inferred',
        evidenceType: 'STRONG_INFERENCE',
        ownership: 'BUYER_INTENT',
        confidence: dim.points >= dim.max * 0.7 ? 'HIGH' : 'MEDIUM',
        safeForOutreach: false,
      })
    }
  }
  return entries
}

function buildOutreachContext(
  intelligence: import('./types').NormalizedIntelligence,
  scoreBreakdown: ReturnType<typeof computeCanonicalScore>,
  pipelineResult: ExtractionPipelineResult,
): CanonicalProspectIntelligence['outreachContext'] {
  const content = intelligence.content
  const proofSignals = content.technicalSignals.length > 0
    ? content.technicalSignals
    : (intelligence.job?.skills ?? [])

  // Determine best proof angle
  let bestProof: string | null = null
  if (proofSignals.length > 0) {
    bestProof = `Relevant technical delivery in: ${proofSignals.slice(0, 3).join(', ')}`
  } else if (intelligence.company.industry) {
    bestProof = `Experience in ${intelligence.company.industry}`
  }

  // Determine personalization anchor
  let personalizationAnchor: string | null = null
  if (content.recentPosts.length > 0) {
    personalizationAnchor = content.recentPosts[0].paraphrase.slice(0, 120)
  } else if (content.explicitProblems.length > 0) {
    personalizationAnchor = content.explicitProblems[0].slice(0, 120)
  } else if (intelligence.opportunity.description) {
    personalizationAnchor = intelligence.opportunity.description.slice(0, 120)
  }

  // Things not to claim
  const thingsNotToClaim: string[] = []
  for (const ev of pipelineResult.evidenceLedger) {
    if (!ev.safeForOutreach) {
      thingsNotToClaim.push(ev.signal)
    }
  }

  return {
    whyNow: intelligence.opportunityTrigger,
    probableNeed: intelligence.probableNeed,
    bestProof,
    personalizationAnchor,
    messageGoal: scoreBreakdown.total >= 70
      ? 'Open a conversation about their delivery needs'
      : scoreBreakdown.total >= 55
        ? 'Learn more about their current situation'
        : 'Establish a low-pressure connection',
    cta: scoreBreakdown.total >= 70
      ? 'Ask about their current delivery situation'
      : 'Brief, no-commitment connection',
    thingsNotToClaim,
  }
}

function buildPersonalizationAngle(
  intelligence: import('./types').NormalizedIntelligence,
): string | null {
  const angles: string[] = []
  const isRemoteOnly = (value: string | null | undefined) => {
    if (!value) return false
    const normalized = value.trim().toLowerCase()
    return /^(remote|remote role|this is remote|fully remote|work from anywhere)[\s.!]*$/.test(normalized)
  }

  // Recent post signal
  if (intelligence.content.recentPosts.length > 0) {
    const post = intelligence.content.recentPosts[0]
    if (post.signals.includes('hiring')) {
      angles.push('hiring signal')
    }
    if (post.signals.includes('technical_problem')) {
      angles.push('technical challenge')
    }
  }

  const stack = intelligence.content.technicalSignals.length > 0
    ? intelligence.content.technicalSignals
    : (intelligence.job?.skills ?? [])
  if (stack.length >= 2) {
    angles.push(`Stack match: ${stack.slice(0, 3).join(', ')}`)
  }

  // Opportunity trigger
  if (intelligence.opportunityTrigger && !isRemoteOnly(intelligence.opportunityTrigger)) {
    angles.push(intelligence.opportunityTrigger.slice(0, 80))
  }

  if (angles.length === 0 && intelligence.content.hiringSignals.length > 0) {
    angles.push(intelligence.content.hiringSignals[0].slice(0, 80))
  }

  // Company initiative
  if (intelligence.content.initiatives.length > 0) {
    angles.push(`Initiative: ${intelligence.content.initiatives[0].slice(0, 60)}`)
  }

  return angles.length > 0 ? angles.slice(0, 3).join(' • ') : null
}

// ── Irrelevant Input Intelligence ─────────────────────────────────────────

function createIrrelevantIntelligence(
  rawText: string,
  classification: { classification: string; confidence: number; reasons: string[] },
): CanonicalProspectIntelligence {
  const now = new Date().toISOString()
  return {
    version: SCORE_VERSION,
    intelligenceRunId: crypto.randomUUID(),
    intelligenceInputHash: buildIntelligenceInputHash({ rawText }),
    intelligenceVersion: INTELLIGENCE_PIPELINE_VERSION,
    computedAt: now,
    canonicalScore: 0,
    scoreVersion: SCORE_VERSION,
    scoredAt: now,
    scoreBreakdown: {
      dimensions: [],
      hardNegatives: ['IRRELEVANT_OR_INSUFFICIENT_INPUT'],
      missingInfo: classification.reasons,
      total: 0,
      label: 'N/A',
      reasons: classification.reasons,
      watchOut: [],
    },
    confidence: 0,
    qualification: 'skip',
    intelligence: {
      person: { fullName: null, firstName: null, title: null, seniority: null, location: null, linkedinUrl: null, otherUrls: [] },
      company: { name: null, domain: null, linkedinUrl: null, industry: null, size: null, sizeEvidence: null, product: null, stage: null, stageEvidence: null },
      opportunity: { signals: [], primarySignal: null, description: null, urgency: 'unknown' },
      job: null,
      content: { recentPosts: [], topics: [], explicitProblems: [], initiatives: [], launches: [], technicalSignals: [], hiringSignals: [] },
      remoteEligibility: {
        workplaceType: 'UNKNOWN',
        remoteScope: 'UNKNOWN',
        eligibility: 'UNCLEAR',
        reason: 'Input classified as irrelevant/insufficient — no eligibility assessment possible.',
      },
      probableNeed: null,
      opportunityTrigger: null,
      timingSignal: null,
      risks: [],
      unknowns: classification.reasons,
      resolvedContradictions: [],
      businessModel: 'UNKNOWN',
      relationship: 'UNKNOWN',
    },
    rawSource: {
      rawInput: rawText,
      sourceType: 'pasted_text',
      sourceUrl: null,
      profileUrl: null,
      companyUrl: null,
      jobUrl: null,
      postUrls: [],
      rawPosts: [],
      rawJobDescription: null,
      rawProfileText: null,
      rawCompanyText: null,
      capturedAt: now,
    },
    evidenceLedger: [],
    remoteEligibility: {
      workplaceType: 'UNKNOWN',
      remoteScope: 'UNKNOWN',
      eligibility: 'UNCLEAR',
      reason: 'Input classified as irrelevant/insufficient — no eligibility assessment possible.',
    },
    extractionCompleteness: {
      score: 0,
      presentFields: [],
      missingFields: ['person.fullName', 'company.name', 'opportunity.signals'],
      weakFields: [],
      repairAttempted: false,
      repairImproved: false,
      sourceUrlsFound: [],
      urlsPreserved: [],
    },
    rescoreEvents: [],
    recommendedIdentityId: null,
    recommendedProofIds: [],
    personalizationAngle: null,
    outreachContext: null,
    extractionCallLog: [],
    extractionTrace: [],
  }
}

// ── Read helpers for surfaces ──────────────────────────────────────────────

/**
 * Get the canonical score for display. All surfaces use this.
 * Never compute a score independently — read from the persisted intelligence.
 */
export function getCanonicalScore(
  canonical: CanonicalProspectIntelligence | null,
): number | null {
  if (!canonical) return null
  return canonical.canonicalScore
}

/**
 * Get the display score (/10). This is a UI-only conversion.
 */
export function getDisplayScore(
  canonical: CanonicalProspectIntelligence | null,
): number | null {
  if (!canonical) return null
  return Math.round(canonical.canonicalScore / 10)
}

/**
 * Get the score breakdown for display. Shows WHY the score is what it is.
 */
export function getScoreBreakdown(
  canonical: CanonicalProspectIntelligence | null,
): CanonicalProspectIntelligence['scoreBreakdown'] | null {
  if (!canonical) return null
  return canonical.scoreBreakdown
}

/**
 * Convert a persisted lead's canonical fields into the legacy `ScoreResult`
 * shape (`{ total, verdict, breakdown, gates }`) so surfaces that were built
 * against the legacy `src/lib/score/rubric.ts` model can display canonical
 * intelligence without a UI rewrite.
 *
 * This is the ONE place that bridges canonical → legacy shape. Any surface
 * showing a lead's score should call this (or read `canonicalScore` /
 * `getDisplayScore` directly) rather than recomputing with `computeScore()`
 * when canonical intelligence is present — recomputing produces a different,
 * independently-derived score on a different scale (legacy is /12, canonical
 * is /100) and is a duplicate source of truth.
 *
 * Returns `null` when no canonical score is on file, so the caller can fall
 * back to `computeScore()` for legacy/pre-canonical leads.
 */
export function canonicalToLegacyScoreResult(persisted: {
  canonicalScore?: number | null
  scoreBreakdown?: unknown
  qualification?: string | null
  verdict?: 'send' | 'research_more' | 'skip' | null
}): {
  total: number
  verdict: 'send' | 'research_more' | 'skip'
  baseVerdict?: 'send' | 'research_more' | 'skip'
  breakdown: Array<{ category: string; label: string; points: number; max: number; note: string }>
  gates: string[]
} | null {
  if (persisted.canonicalScore == null) return null

  const breakdown = persisted.scoreBreakdown as CanonicalProspectIntelligence['scoreBreakdown'] | null | undefined
  const dimensions = Array.isArray(breakdown?.dimensions) ? breakdown!.dimensions : []

  const qualificationVerdict =
    persisted.qualification === 'strong' || persisted.qualification === 'worth_pursuing'
      ? 'send' as const
      : persisted.qualification === 'maybe'
        ? 'research_more' as const
        : persisted.qualification === 'skip'
          ? 'skip' as const
          : null

  const verdict = persisted.verdict ?? qualificationVerdict ?? 'research_more'

  return {
    total: persisted.canonicalScore,
    verdict,
    baseVerdict: persisted.verdict ?? qualificationVerdict ?? undefined,
    breakdown: dimensions.map((d) => ({
      category: d.key,
      label: d.label,
      points: d.points,
      max: d.max,
      note: d.note,
    })),
    gates: ['Canonical Intelligence V2 score in use.'],
  }
}

/**
 * Check if a re-score is warranted based on the rules:
 * - Source intelligence materially changes
 * - User explicitly requests it
 * - Scoring model version changes
 * - Meaningful new signal arrives
 */
/**
 * Best-available signal evidence text for a canonical intelligence result,
 * for surfaces that need a single evidence string (e.g. ExtractedLead.
 * signalEvidence, used by draft generation's anti-hallucination guard).
 *
 * Prefers structured evidence in this order: opportunity.description,
 * opportunityTrigger, a hiring/problem signal sentence, the first
 * non-chrome recent-post paraphrase. Only falls back to a prefix of the raw
 * source text as an absolute last resort — and even then, picks the first
 * non-chrome LINE, not an arbitrary character-count slice, which previously
 * could grab pure LinkedIn navigation noise ("· 3rd\nfounder of X\nBerlin,
 * Germany\n·\nContact info\nsvg...") for profiles whose opportunity signal
 * (e.g. growth_signal) never populates description/opportunityTrigger.
 * See BUG_LEDGER — Daria Redkina / Solsonic hardening fixture.
 */
export function deriveSignalEvidenceFallback(
  canonical: CanonicalProspectIntelligence,
  rawText: string,
): string {
  const intel = canonical.intelligence

  if (intel.opportunity.description) return intel.opportunity.description
  if (intel.opportunityTrigger) return intel.opportunityTrigger
  if (intel.content.hiringSignals[0]) return intel.content.hiringSignals[0]
  if (intel.content.explicitProblems[0]) return intel.content.explicitProblems[0]

  const firstRealPost = intel.content.recentPosts.find(
    (p) => !isLinkedInChromeText(p.paraphrase) && !isLinkedInChromeText(p.verbatimQuote),
  )
  if (firstRealPost) return firstRealPost.paraphrase || firstRealPost.verbatimQuote || ''

  const firstNonChromeLine = rawText
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length >= 20 && !isLinkedInChromeText(l))
  if (firstNonChromeLine) return firstNonChromeLine.slice(0, 220)

  // Genuinely nothing usable — return empty rather than chrome noise.
  // Downstream (signalEvidenceMatch) correctly treats short/empty evidence
  // as "no match," which is the honest outcome here.
  return ''
}

/**
 * Verifies a CLIENT-HELD canonical result is still valid for reuse against a
 * given rawText, under the current pipeline/score versions. Used by "Try
 * Another Angle" (Relay team bug bash — TEAM-005): the ephemeral /prospect
 * flow has no persisted lead yet for the normal reuseIfUnchanged lookup to
 * match against, so the client sends back the canonical result it already
 * holds, and this function is the server-side proof that it's genuinely
 * still valid rather than merely trusting the client. Never returns true
 * for a tampered, stale-version, or wrong-input result — see the individual
 * checks. Pure and synchronous, safe to unit test directly.
 */
export function isClientCanonicalStillValid(
  clientCanonical: CanonicalProspectIntelligence | null | undefined,
  rawText: string,
  forceReanalyze: boolean,
): clientCanonical is CanonicalProspectIntelligence {
  if (!clientCanonical || forceReanalyze) return false
  if (clientCanonical.intelligenceInputHash !== buildIntelligenceInputHash({ rawText })) return false
  if (clientCanonical.intelligenceVersion !== INTELLIGENCE_PIPELINE_VERSION) return false
  if (clientCanonical.scoreVersion !== SCORE_VERSION) return false
  return true
}

export function shouldRescore(
  existing: CanonicalProspectIntelligence,
  trigger: RescoreOptions['trigger'],
): boolean {
  // Always allow user-requested re-score
  if (trigger === 'user_requested') return true

  // Re-score if model version changed
  if (existing.scoreVersion !== SCORE_VERSION) return true

  // Source changes and new signals are handled by the caller
  // (they produce new intelligence that gets scored)
  return trigger === 'source_changed' || trigger === 'new_signal'
}
