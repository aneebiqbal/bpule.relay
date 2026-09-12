import type {
  CsvImport,
  MarketRegion,
  Fact,
  Lead,
  Message,
  MessageType,
  NotificationLogEntry,
  Outcome,
  Play,
  Profile,
  ProofItem,
  PushSubscription,
  Rep,
  RoleCategory,
  SignalId,
  StyleCard,
  StyleSampleSource,
  UpworkJob,
  UpworkMessage,
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
  titleRaw?: string | null
  locationRaw?: string | null
  url?: string | null
  rawInput?: string | null
  signalType: SignalId
  signalEvidence: string
  verbatimQuote?: string | null
  tags?: string[]
  roleCategory?: RoleCategory
  marketRegion?: MarketRegion
  extractionConfidence?: number
  extractionProfile?: Record<string, unknown>
}

export interface ExtractionMetrics {
  total: number
  failures: number
  failureRate: number
  avgLatencyMs: number
  p95LatencyMs: number
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

export interface GoldenCaseRow {
  id: string
  leadId: string
  knownReplied: boolean
  sentText: string
  note: string | null
  active: boolean
  createdAt: string
}

export interface EvalRunRow {
  id: string
  promptVersion: string
  goldenSetSize: number
  replyRateScore: number
  selfCheckPassRate: number
  companyMentionRate: number
  evidenceMentionRate: number
  overallScore: number
  details: unknown
  createdAt: string
}

export interface FewShotWin {
  id: string
  messageId: string
  leadId: string
  playId: string | null
  signalType: number | null
  sentText: string
  company: string
  signalEvidence: string | null
  tags: string[]
  createdAt: string
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
  /** Every rep, for the Manage Profiles screen's rep grouping (read is open to any authenticated rep, matching RLS). */
  listAllReps(): Promise<Rep[]>
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
  /** Every rep's profiles, for the Manage Profiles screen. Read is open to any authenticated rep, matching RLS; writes are still admin-only. */
  listAllProfiles(): Promise<Profile[]>
  /** Admin only: create/update a profile on behalf of any rep. */
  upsertProfileAdmin(input: {
    id?: string
    repId: string
    platform: 'linkedin' | 'upwork'
    label?: string | null
    profileUrl?: string | null
    headline?: string | null
    cvPath?: string | null
  }): Promise<Profile>
  /** Admin only: delete any rep's profile. */
  deleteProfileAdmin(id: string): Promise<void>
  // proof items
  listProofItems(profileId: string): Promise<ProofItem[]>
  /** Admin only: proof items for a profile with client_name unredacted, for the edit view. */
  listProofItemsAdmin(profileId: string): Promise<ProofItem[]>
  upsertProofItem(input: {
    id?: string
    profileId: string
    clientNamed?: boolean
    clientName?: string | null
    permissionOnFile?: boolean
    projectSummary: string
    reviewQuote?: string | null
    tags?: string[]
    embedding?: number[] | null
  }): Promise<ProofItem>
  deleteProofItem(id: string): Promise<void>
  /** Admin only: create/update a proof item on any profile, unredacted. */
  upsertProofItemAdmin(input: {
    id?: string
    profileId: string
    clientNamed?: boolean
    clientName?: string | null
    permissionOnFile?: boolean
    projectSummary: string
    reviewQuote?: string | null
    tags?: string[]
    embedding?: number[] | null
  }): Promise<ProofItem>
  /** Admin only: delete any proof item. */
  deleteProofItemAdmin(id: string): Promise<void>
  /** Find proof items whose tags overlap with the given tags, ranked by overlap count. */
  matchProofItems(tags: string[], limit?: number): Promise<ProofItem[]>
  /** Semantic proof matching via pgvector embedding search. */
  matchProofItemsByEmbedding(embedding: number[], limit?: number): Promise<Array<{ item: ProofItem; similarity: number }>>
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
  getExtractionMetrics(): Promise<ExtractionMetrics>
  logExtractionRun(input: { success: boolean; latencyMs: number; model: string; error?: string | null }): Promise<void>
  /** All leads a team lead can see; admin only in Supabase mode. */
  listAllLeadsAdmin(): Promise<Lead[]>
  // eval harness
  listGoldenSet(): Promise<GoldenCaseRow[]>
  addGoldenCase(input: { leadId: string; messageId?: string; knownReplied: boolean; sentText?: string; note?: string }): Promise<GoldenCaseRow>
  removeGoldenCase(id: string): Promise<void>
  listEvalRuns(): Promise<EvalRunRow[]>
  saveEvalRun(run: Omit<EvalRunRow, 'id' | 'createdAt'>): Promise<EvalRunRow>
  // few-shot wins
  listFewShotWins(limit?: number): Promise<FewShotWin[]>
  refreshFewShotWins(): Promise<number>
  // upwork jobs
  createUpworkJob(input: {
    title: string
    description: string
    budgetMin?: number | null
    budgetMax?: number | null
    hourlyRateMin?: number | null
    hourlyRateMax?: number | null
    proposalCount?: number | null
    connectsCost?: number
    requiredSkills?: string[]
    urgencySignal?: string | null
    rawInput?: string | null
    tags?: string[]
  }): Promise<UpworkJob>
  getUpworkJob(id: string): Promise<(UpworkJob & { messages: UpworkMessage[] }) | null>
  listUpworkJobs(): Promise<UpworkJob[]>
  updateUpworkJobScore(id: string, score: { total: number; verdict: UpworkJob['verdict'] }): Promise<void>
  saveUpworkDraft(input: { jobId: string; type: UpworkMessage['type']; draftText: string; modelUsed: string }): Promise<UpworkMessage>
  markUpworkApplied(jobId: string, sentText: string, type?: UpworkMessage['type']): Promise<void>
  // csv imports
  logCsvImport(input: Omit<CsvImport, 'id' | 'createdAt' | 'repId'>): Promise<CsvImport>
  listCsvImports(): Promise<CsvImport[]>
  // archive search
  archiveSearch(opts: {
    query: string
    entityFilter?: 'lead' | 'proof' | 'upwork' | 'all'
    statusFilter?: string[]
    signalFilter?: number[]
    playFilter?: string[]
    repFilter?: string[]
    dateFrom?: string | null
    dateTo?: string | null
    limit?: number
  }): Promise<Array<{
    entityType: string
    id: string
    title: string
    subtitle: string
    status: string | null
    createdAt: string
    rank: number
  }>>
  // push subscriptions
  savePushSubscription(sub: Omit<PushSubscription, 'id' | 'createdAt'>): Promise<PushSubscription>
  getPushSubscription(repId: string): Promise<PushSubscription | null>
  deletePushSubscription(repId: string): Promise<void>
  // notifications
  listNotifications(): Promise<NotificationLogEntry[]>
  markNotificationRead(id: string): Promise<void>
}
