export type RepRole = 'rep' | 'sourcer' | 'admin'

export type OrganizationPlan = 'trial' | 'active' | 'past_due' | 'canceled'

export interface Organization {
  id: string
  name: string
  plan: OrganizationPlan
  billingCustomerId: string | null
  createdAt: string
}

export interface SignalDefinition {
  id: number
  name: string
  weight: number
  short: string
  description: string
  example: string
}

export interface VerdictThresholds {
  send: { min: number; max: number }
  research_more: { min: number; max: number }
  skip: { min: number; max: number }
}

export interface OrganizationRulebook {
  organizationId: string
  signals: SignalDefinition[]
  verdictThresholds: VerdictThresholds
  maxSignalWeight: number
  maxCompleteness: number
  confidenceSendThreshold: number
}

export interface Rep {
  id: string
  name: string
  role: RepRole
  organizationId: string
  createdAt: string
}

export type SignalId = number

export type Verdict = 'send' | 'research_more' | 'skip'

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'followed_up'
  | 'replied'
  | 'no'
  | 'dead'

export interface Lead {
  id: string
  organizationId: string
  ownerRepId: string | null
  company: string
  companyKey: string
  contactName: string | null
  contactTitle: string | null
  titleRaw?: string | null
  locationRaw?: string | null
  url: string | null
  rawInput: string | null
  roleCategory?: RoleCategory | null
  marketRegion?: MarketRegion | null
  extractionConfidence?: number | null
  extractionProfile?: Record<string, unknown> | null
  signalType: SignalId | null
  signalEvidence: string | null
  verbatimQuote: string | null
  score: number | null
  verdict: Verdict | null
  status: LeadStatus
  playId: string | null
  tags: string[]
  createdAt: string
}

export type MessageType = 'dm' | 'connection' | 'upwork' | 'followup' | 'reply'

export interface Message {
  id: string
  organizationId: string
  leadId: string
  repId: string | null
  type: MessageType
  draftText: string | null
  sentText: string | null
  sentAt: string | null
  modelUsed: string | null
  createdAt: string
}

export type OutcomeStage =
  | 'replied'
  | 'read'
  | 'check'
  | 'slice'
  | 'close'
  | 'standing'

export interface Outcome {
  id: string
  organizationId: string
  leadId: string
  stage: OutcomeStage
  occurredAt: string
}

export type UpworkJobVerdict = 'apply' | 'apply_if_connects' | 'skip'

export type UpworkJobStatus =
  | 'new'
  | 'drafted'
  | 'applied'
  | 'replied'
  | 'no'
  | 'dead'

export interface UpworkJob {
  id: string
  organizationId: string
  ownerRepId: string | null
  title: string
  description: string
  budgetMin: number | null
  budgetMax: number | null
  hourlyRateMin: number | null
  hourlyRateMax: number | null
  proposalCount: number | null
  connectsCost: number
  requiredSkills: string[]
  urgencySignal: string | null
  score: number | null
  verdict: UpworkJobVerdict | null
  status: UpworkJobStatus
  extractedFields: Record<string, unknown> | null
  rawInput: string | null
  tags: string[]
  createdAt: string
}

export interface UpworkMessage {
  id: string
  organizationId: string
  jobId: string
  repId: string | null
  type: 'cover' | 'followup' | 'reply'
  draftText: string | null
  sentText: string | null
  sentAt: string | null
  modelUsed: string | null
  createdAt: string
}

export interface PushSubscription {
  id: string
  organizationId: string
  repId: string
  endpoint: string
  p256dh: string
  auth: string
  createdAt: string
}

export interface NotificationLogEntry {
  id: string
  organizationId: string
  repId: string
  type: 'reply' | 'followup_eligible'
  payload: Record<string, unknown>
  read: boolean
  createdAt: string
}

export interface CsvImport {
  id: string
  organizationId: string
  repId: string
  fileName: string | null
  totalRows: number
  imported: number
  duplicates: number
  invalid: number
  details: unknown
  createdAt: string
}

export type StyleSampleSource = 'quiz' | 'pasted_samples' | 'both'

export interface StyleCard {
  contractions: 'mostly_no' | 'sometimes' | 'mostly_yes'
  formality: 1 | 2 | 3 | 4 | 5
  sentence_length: 'short' | 'medium' | 'long'
  punctuation: 'relaxed' | 'standard' | 'heavy'
  openers: 'question' | 'statement'
  emoji_use: 'none' | 'light'
  greeting: string
  sign_off: string
  never_words: string[]
  preferred_words: string[]
  summary: string
}

export interface VoiceProfile {
  id: string
  repId: string
  organizationId: string
  styleCard: StyleCard
  sampleSource: StyleSampleSource
  calibratedAt: string
}

export interface Fact {
  id: string
  organizationId: string
  label: string
  value: string
  factType: string | null
  addedBy: string | null
  createdAt: string
}

export interface Profile {
  id: string
  repId: string
  organizationId: string
  platform: 'linkedin' | 'upwork'
  label: string | null
  profileUrl: string | null
  headline: string | null
  cvPath: string | null
  createdAt: string
}

export interface ProofItem {
  id: string
  organizationId: string
  profileId: string
  clientNamed: boolean
  clientName: string | null
  permissionOnFile: boolean
  projectSummary: string
  reviewQuote: string | null
  tags: string[]
  createdAt: string
}

export interface Play {
  id: string
  organizationId: string
  name: string
  situation: string
  templateShape: string
}

export interface ScoreBreakdownItem {
  category: string
  label: string
  points: number
  max: number
  note: string
}

export interface ScoreResult {
  total: number
  verdict: Verdict
  baseVerdict?: Verdict
  breakdown: ScoreBreakdownItem[]
  gates?: string[]
}

export type RoleCategory =
  | 'founder_cofounder'
  | 'ceo'
  | 'technical_leadership'
  | 'product'
  | 'hiring_manager_recruiter'
  | 'other'

export type MarketRegion = 'US' | 'UK' | 'EU' | 'CA' | 'AU' | 'UAE' | 'SG' | 'outside_core' | 'unknown'

export interface RecentPostExtract {
  paraphrase: string
  verbatimQuote: string | null
}

export interface ExtractedLead {
  name: string | null
  title: string | null
  titleRaw?: string | null
  company: string
  url: string | null
  locationRaw?: string | null
  aboutSummary?: string | null
  experienceSummary?: string | null
  recentPosts?: RecentPostExtract[]
  roleCategory?: RoleCategory
  marketRegion?: MarketRegion
  signalType: SignalId
  signalEvidence: string
  extractionConfidence?: number
  confidenceNotes?: string[]
  verbatimQuote: string | null
  /** Stack/domain tags for proof matching; produced once at extraction time. */
  tags: string[]
}

// ── Content Engine (decoupled — no references to bpulse-specific tables) ──

export type ContentPlatform = 'linkedin' | 'x'

export type ContentDraftStatus = 'draft' | 'ready' | 'posted' | 'rejected'

export interface ContentPersona {
  id: string
  repId: string
  organizationId: string
  displayName: string
  platforms: ContentPlatform[]
  voiceProfileId: string | null
  humorStyle: string
  valuesAndOpinions: string[]
  admiredExamples: string[]
  createdAt: string
}

export interface ContentPillar {
  id: string
  organizationId: string
  personaId: string
  pillarName: string
  description: string
  createdAt: string
}

export interface TopicCluster {
  id: string
  organizationId: string
  personaId: string
  clusterName: string
  description: string
  sourceType: 'profile' | 'answer' | 'research' | 'system'
  mergedIntoId: string | null
  lastInputAt: string | null
  lastResearchAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ContentResearchFinding {
  id: string
  organizationId: string
  personaId: string
  topicClusterId: string
  finding: string
  sourceLabel: string
  sourceUrl: string
  sourcePublishedAt: string | null
  createdAt: string
  used: boolean
}

export type ContentDraftReaction = 'posting' | 'not_for_me' | 'posting_after_edit'

export interface ContentDraftFeedback {
  id: string
  organizationId: string
  personaId: string
  draftId: string
  topicClusterId: string | null
  sourceKind: 'answer' | 'conviction' | 'field_update'
  reaction: ContentDraftReaction
  edited: boolean
  editSignals: string[]
  createdAt: string
}

export interface ContentDraft {
  id: string
  organizationId: string
  personaId: string
  pillarId: string | null
  topicClusterId: string | null
  researchFindingId: string | null
  sourceKind: 'answer' | 'conviction' | 'field_update'
  sourceMaterial: string
  platform: ContentPlatform
  caption: string
  hookScore: number | null
  hookFeedback: string
  selfCheckPassed: boolean
  selfCheckNote: string
  specificityHit: boolean
  status: ContentDraftStatus
  createdAt: string
}

export interface ContentHistoryEntry {
  id: string
  organizationId: string
  personaId: string
  pillarId: string | null
  topicClusterId: string | null
  platform: ContentPlatform
  openingLine: string
  postedAt: string
}

export interface TrendingAngle {
  id: string
  organizationId: string
  pillarId: string
  topicClusterId: string | null
  angleDescription: string
  sourceNote: string
  sourceUrl: string
  addedBy: string | null
  addedAt: string
  used: boolean
}
