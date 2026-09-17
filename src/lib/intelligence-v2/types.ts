/**
 * Canonical Prospect Intelligence — Type Definitions
 *
 * Single source of truth for the intelligence pipeline.
 * Once persisted, NO surface may independently recompute the lead score.
 */

// ── Remote Eligibility ─────────────────────────────────────────────────────

export type WorkplaceType = 'REMOTE' | 'HYBRID' | 'ONSITE' | 'UNKNOWN'

export type RemoteScope =
  | 'WORLDWIDE'
  | 'ANYWHERE'
  | 'COUNTRY_RESTRICTED'
  | 'REGION_RESTRICTED'
  | 'TIMEZONE_RESTRICTED'
  | 'UNKNOWN'

export type EligibilityStatus =
  | 'ELIGIBLE'
  | 'LIKELY_ELIGIBLE'
  | 'UNCLEAR'
  | 'INELIGIBLE'

export interface RemoteEligibility {
  workplaceType: WorkplaceType
  remoteScope: RemoteScope
  eligibility: EligibilityStatus
  /** Countries explicitly allowed/restricted, if stated */
  allowedCountries?: string[]
  restrictedCountries?: string[]
  /** Timezone requirements, if stated */
  timezoneRequirement?: string
  /** PKT overlap feasibility (0-100) for timezone-restricted roles */
  pktOverlapFeasibility?: number
  /** Human-readable explanation */
  reason: string
  /** Evidence supporting this assessment */
  evidence?: string[]
}

// ── Source / Evidence Ledger ───────────────────────────────────────────────

export type EvidenceType = 'FACT' | 'STRONG_INFERENCE' | 'WEAK_INFERENCE'

export interface EvidenceEntry {
  signal: string
  source: 'linkedin_profile' | 'linkedin_post' | 'job_posting' | 'company_website' | 'pasted_text' | 'user_provided' | 'inferred'
  sourceUrl?: string
  evidenceType: EvidenceType
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  safeForOutreach: boolean
  verbatimQuote?: string
}

// ── Extracted Entities (Pass A) ────────────────────────────────────────────

export interface ExtractedPerson {
  fullName: string | null
  firstName: string | null
  title: string | null
  seniority: string | null
  location: string | null
  linkedinUrl: string | null
  otherUrls: string[]
}

export interface ExtractedCompany {
  name: string | null
  domain: string | null
  linkedinUrl: string | null
  industry: string | null
  size: string | null
  sizeEvidence: string | null
  product: string | null
  stage: string | null
  stageEvidence: string | null
}

export type OpportunitySignal =
  | 'hiring'
  | 'freelance_project_need'
  | 'technical_problem'
  | 'growth_signal'
  | 'funding'
  | 'launch'
  | 'migration'
  | 'rebuild'
  | 'hiring_pressure'
  | 'explicit_ask'

export interface ExtractedOpportunity {
  signals: OpportunitySignal[]
  primarySignal: OpportunitySignal | null
  description: string | null
  urgency: 'immediate' | 'near_term' | 'future' | 'unknown'
}

export interface ExtractedJob {
  title: string | null
  employmentType: 'full_time' | 'part_time' | 'contract' | 'freelance' | 'unknown'
  workplaceType: WorkplaceType
  allowedGeography: string | null
  timezone: string | null
  compensation: string | null
  skills: string[]
  seniority: string | null
  source: string | null
  postedDate: string | null
}

export interface ExtractedContent {
  recentPosts: Array<{
    paraphrase: string
    verbatimQuote: string | null
    topics: string[]
    signals: OpportunitySignal[]
  }>
  topics: string[]
  explicitProblems: string[]
  initiatives: string[]
  launches: string[]
  technicalSignals: string[]
  hiringSignals: string[]
}

// ── Normalized Intelligence (Pass B → C) ───────────────────────────────────

export interface NormalizedIntelligence {
  person: ExtractedPerson
  company: ExtractedCompany
  opportunity: ExtractedOpportunity
  job: ExtractedJob | null
  content: ExtractedContent
  remoteEligibility: RemoteEligibility
  /** Why could this person/company realistically hire us? */
  probableNeed: string | null
  opportunityTrigger: string | null
  timingSignal: string | null
  /** Risks identified */
  risks: string[]
  /** Unknowns / missing information */
  unknowns: string[]
  /** Contradictions found and resolved */
  resolvedContradictions: string[]
}

// ── Score Breakdown ────────────────────────────────────────────────────────

export interface ScoreDimensionBreakdown {
  key: string
  label: string
  points: number
  max: number
  note: string
  /** Whether this is a positive or negative contributor */
  direction: 'positive' | 'negative' | 'neutral'
}

export interface CanonicalScoreBreakdown {
  dimensions: ScoreDimensionBreakdown[]
  /** Hard negatives that overrode the score */
  hardNegatives: string[]
  /** Missing information that reduced confidence */
  missingInfo: string[]
  /** Final computed score 0-100 */
  total: number
  /** Qualitative label */
  label: string
  /** 3-5 decisive reasons */
  reasons: string[]
  /** Things to watch out for */
  watchOut: string[]
}

// ── Raw Source Data (never destroyed) ──────────────────────────────────────

export interface RawSourceData {
  rawInput: string
  sourceType: 'linkedin_profile' | 'linkedin_post' | 'job_posting' | 'company_website' | 'pasted_text' | 'mixed'
  sourceUrl: string | null
  profileUrl: string | null
  companyUrl: string | null
  jobUrl: string | null
  postUrls: string[]
  rawPosts: string[]
  rawJobDescription: string | null
  rawProfileText: string | null
  rawCompanyText: string | null
  capturedAt: string
}

// ── Extraction Completeness ────────────────────────────────────────────────

export interface ExtractionCompleteness {
  /** Overall completeness 0-100 */
  score: number
  /** Fields that were successfully extracted */
  presentFields: string[]
  /** Fields that are missing */
  missingFields: string[]
  /** Fields with low confidence */
  weakFields: Array<{ field: string; reason: string }>
  /** Whether auto-repair was attempted */
  repairAttempted: boolean
  /** Whether repair improved the extraction */
  repairImproved: boolean
  /** URLs found in source */
  sourceUrlsFound: string[]
  /** URLs preserved after normalization */
  urlsPreserved: string[]
}

// ── Re-score Event ─────────────────────────────────────────────────────────

export interface RescoreEvent {
  fromScore: number
  toScore: number
  reason: string
  version: string
  timestamp: string
  trigger: 'source_changed' | 'user_requested' | 'model_version_changed' | 'new_signal'
}

// ── Canonical Prospect Intelligence (the persisted object) ─────────────────

export interface CanonicalProspectIntelligence {
  /** Schema version */
  version: 'relay_qualification_v2'
  /** When this intelligence was produced */
  computedAt: string
  /** The canonical score 0-100 */
  canonicalScore: number
  /** Score version/model used */
  scoreVersion: string
  /** When the score was last computed */
  scoredAt: string
  /** Transparent score breakdown */
  scoreBreakdown: CanonicalScoreBreakdown
  /** Extraction confidence 0-100 */
  confidence: number
  /** Qualification verdict */
  qualification: 'strong' | 'worth_pursuing' | 'maybe' | 'skip'
  /** Normalized intelligence */
  intelligence: NormalizedIntelligence
  /** Raw source data — never destroyed */
  rawSource: RawSourceData
  /** Source/evidence ledger */
  evidenceLedger: EvidenceEntry[]
  /** Remote eligibility assessment */
  remoteEligibility: RemoteEligibility
  /** Extraction completeness assessment */
  extractionCompleteness: ExtractionCompleteness
  /** Re-score history */
  rescoreEvents: RescoreEvent[]
  /** Best Revenue Identity to approach (if known) */
  recommendedIdentityId: string | null
  /** Best proof to use (if known) */
  recommendedProofIds: string[]
  /** Best personalization angle */
  personalizationAngle: string | null
  /** Outreach context for message generation */
  outreachContext: {
    whyNow: string | null
    probableNeed: string | null
    bestProof: string | null
    personalizationAnchor: string | null
    messageGoal: string | null
    cta: string | null
    thingsNotToClaim: string[]
  } | null
  /** Provider/model/task/latency/fallback log */
  extractionCallLog: Array<{
    provider: string
    model: string
    task: string
    latencyMs: number
    fallback: boolean
  }>
  /** Timing trace for latency debugging */
  extractionTrace?: Array<{ stage: string; ms: number; provider?: string }>
}

// ── Score Label Mapping ────────────────────────────────────────────────────

export const SCORE_LABELS: Array<{ min: number; max: number; label: string; qualification: CanonicalProspectIntelligence['qualification'] }> = [
  { min: 85, max: 100, label: 'Strong opportunity', qualification: 'strong' },
  { min: 70, max: 84, label: 'Worth pursuing', qualification: 'worth_pursuing' },
  { min: 55, max: 69, label: 'Maybe — needs more signal', qualification: 'maybe' },
  { min: 40, max: 54, label: 'Weak fit', qualification: 'skip' },
  { min: 0, max: 39, label: 'Not a fit', qualification: 'skip' },
]

export function scoreLabel(score: number): { label: string; qualification: CanonicalProspectIntelligence['qualification'] } {
  for (const entry of SCORE_LABELS) {
    if (score >= entry.min && score <= entry.max) {
      return { label: entry.label, qualification: entry.qualification }
    }
  }
  return { label: 'Not a fit', qualification: 'skip' }
}

/** Convert canonical 0-100 score to display /10 */
export function canonicalToDisplay(score: number): number {
  return Math.round(score / 10)
}
