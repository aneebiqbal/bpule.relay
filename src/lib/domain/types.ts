export type RepRole = 'rep' | 'sourcer' | 'admin'

export interface Rep {
  id: string
  name: string
  role: RepRole
  createdAt: string
}

export const SIGNAL_IDS = [
  1, 2, 3, 4, 5, 6, 7,
] as const

export type SignalId = (typeof SIGNAL_IDS)[number]

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
  repId: string
  endpoint: string
  p256dh: string
  auth: string
  createdAt: string
}

export interface NotificationLogEntry {
  id: string
  repId: string
  type: 'reply' | 'followup_eligible'
  payload: Record<string, unknown>
  read: boolean
  createdAt: string
}

export interface CsvImport {
  id: string
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
  styleCard: StyleCard
  sampleSource: StyleSampleSource
  calibratedAt: string
}

export interface Fact {
  id: string
  label: string
  value: string
  factType: string | null
  addedBy: string | null
  createdAt: string
}

export interface Profile {
  id: string
  repId: string
  platform: 'linkedin' | 'upwork'
  label: string | null
  profileUrl: string | null
  headline: string | null
  cvPath: string | null
  createdAt: string
}

export interface ProofItem {
  id: string
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
