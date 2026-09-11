import type {
  Fact,
  Lead,
  Message,
  MessageType,
  Outcome,
  Play,
  Profile,
  ProofItem,
  Rep,
  SignalId,
  StyleCard,
  StyleSampleSource,
  Verdict,
  VoiceProfile,
} from '@/lib/domain/types'

export interface StoreContext {
  /** Current rep resolved from auth/session. Null in demo mode is impossible. */
  rep: Rep
  mode: 'demo' | 'supabase'
}

export interface NewLeadInput {
  company: string
  contactName?: string | null
  contactTitle?: string | null
  url?: string | null
  rawInput?: string | null
  signalType: SignalId
  signalEvidence: string
  verbatimQuote?: string | null
  tags?: string[]
}

export interface CreateLeadResult {
  blocked: boolean
  reason?: string
  existingOwnerName?: string
  lead?: Lead
}

export interface SaveDraftInput {
  leadId: string
  type: MessageType
  draftText: string
  modelUsed: string
}

export interface RateMetric {
  sent: number
  sentLeads: number
  repliedLeads: number
  replyRate: number | null
  readLeads: number
  checkedLeads: number
  readToCheckRate: number | null
}

export interface LeadDetail extends Lead {
  messages: Message[]
  outcomes: Outcome[]
}

export interface QueueData {
  todaySends: number
  dailyLimit: number
  queue: Lead[]
  /** Owned leads whose prospect has replied and still needs a response. */
  replies: Lead[]
}

export interface TeamStats {
  overall: RateMetric
  perRep: RepRateRow[]
  perPlay: PlayRateRow[]
}

export interface RepRateRow extends RateMetric {
  rep: Rep
}

export interface PlayRateRow extends RateMetric {
  play: Play | null
}

export interface TodayDashboard {
  mine: QueueData
  team: RateMetric
}

export interface DosageResult {
  allowed: boolean
  todaySends: number
  limit: number
  message?: string
}

export interface ScoutStore {
  // leads
  createLead(lead: NewLeadInput): Promise<CreateLeadResult>
  updateLeadScore(
    id: string,
    score: { total: number; verdict: Verdict },
  ): Promise<void>
  updateLeadTags(id: string, tags: string[]): Promise<void>
  getLead(id: string): Promise<LeadDetail | null>
  listOwnedLeads(): Promise<Lead[]>
  getQueue(): Promise<QueueData>
  // messages
  saveDraft(input: SaveDraftInput): Promise<Message>
  /** Marks a lead contacted after a human sends the message externally. */
  markContacted(leadId: string, sentText: string, messageType?: MessageType): Promise<DosageResult>
  // voice profiles
  getVoiceProfile(): Promise<VoiceProfile | null>
  setVoiceProfile(
    styleCard: StyleCard,
    sampleSource: StyleSampleSource,
  ): Promise<VoiceProfile>
  // profiles (multi-platform identity)
  listProfiles(): Promise<Profile[]>
  getProfile(id: string): Promise<Profile | null>
  upsertProfile(input: {
    id?: string
    platform: 'linkedin' | 'upwork'
    label?: string | null
    profileUrl?: string | null
    headline?: string | null
    cvPath?: string | null
  }): Promise<Profile>
  deleteProfile(id: string): Promise<void>
  // proof items
  listProofItems(profileId: string): Promise<ProofItem[]>
  upsertProofItem(input: {
    id?: string
    profileId: string
    clientNamed?: boolean
    clientName?: string | null
    permissionOnFile?: boolean
    projectSummary: string
    reviewQuote?: string | null
    tags?: string[]
  }): Promise<ProofItem>
  deleteProofItem(id: string): Promise<void>
  /** Find proof items whose tags overlap with the given tags, ranked by overlap count. */
  matchProofItems(tags: string[], limit?: number): Promise<ProofItem[]>
  // facts
  listFacts(): Promise<Fact[]>
  upsertFact(input: {
    id?: string
    label: string
    value: string
    factType?: string | null
  }): Promise<Fact>
  deleteFact(id: string): Promise<void>
  // plays
  listPlays(): Promise<Play[]>
  // dashboard / team
  getTodayDashboard(): Promise<TodayDashboard>
  getTeamStats(): Promise<TeamStats>
  /** All leads a team lead can see; admin only in Supabase mode. */
  listAllLeadsAdmin(): Promise<Lead[]>
}