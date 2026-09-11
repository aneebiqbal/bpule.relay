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
  url: string | null
  rawInput: string | null
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
  breakdown: ScoreBreakdownItem[]
}

export interface ExtractedLead {
  name: string | null
  title: string | null
  company: string
  url: string | null
  signalType: SignalId
  signalEvidence: string
  verbatimQuote: string | null
  /** Stack/domain tags for proof matching; produced once at extraction time. */
  tags: string[]
}