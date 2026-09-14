import type {
  ContentDraft,
  ContentDraftFeedback,
  ContentDraftStatus,
  ContentHistoryEntry,
  ContentPersona,
  ContentPillar,
  ContentPlatform,
  ContentPostStructure,
  ContentProfile,
  ContentProfileExpertise,
  ContentProfileTechnology,
  ContentProfileGoal,
  ContentProfileTopic,
  ContentProfileOpinion,
  ContentProfileProject,
  ContentProfileExperience,
  ContentProfileWritingCharacteristics,
  ContentProfileStorytellingTendency,
  ContentMemory,
  ContentMemoryType,
  ContentOpportunity,
  ContentOpportunityType,
  ContentOpportunityQualification,
  ContentIdeaGenome,
  IdeaGenomeSource,
  IdeaGenomeArchetype,
  ContentEvaluation,
  ContentInterviewSession,
  ContentInterviewAnswer,
  ConversationStage,
  ConversationState,
  CsvImport,
  EditLearning,
  Fact,
  Lead,
  MarketRegion,
  Message,
  MessageType,
  NotificationLogEntry,
  OrganizationRulebook,
  Outcome,
  Play,
  Profile,
  ProfileAssignment,
  ProofCard,
  ProofItem,
  PushSubscription,
  Rep,
  RoleCategory,
  SalesMemory,
  SalesMemoryType,
  SignalId,
  StyleCard,
  StyleSampleSource,
  TopicCluster,
  TrendingAngle,
  ContentResearchFinding,
  ContentJourneyEntry,
  ContentQuickCapture,
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
  /** Estimated USD cost over the same rolling window, split by which tier served the call. */
  costByTier: Record<'tier1' | 'tier2' | 'tier3' | 'tier4', number>
  totalCostUsd: number
  /** Request count by tier over the same window — the number that actually shows whether the free tier (tier1/Groq, $0 cost either way) is absorbing real volume or the paid chain is doing more work than expected. */
  requestsByTier: Record<'tier1' | 'tier2' | 'tier3' | 'tier4', number>
}

export interface ModelCallLogInput {
  task: 'extract' | 'draft'
  success: boolean
  latencyMs: number
  model: string
  costTier?: 'tier1' | 'tier2' | 'tier3' | 'tier4'
  host?: string
  costUsd?: number
  error?: string | null
}

export interface HostCallInput {
  task: 'extract' | 'draft' | 'calibrate' | 'refine'
  host: string
  model?: string
  costTier?: 'tier1' | 'tier2' | 'tier3' | 'tier4'
  success: boolean
  failureReason?: 'rate_limit' | 'insufficient_balance' | 'timeout' | 'auth' | 'other'
  errorMessage?: string
  latencyMs?: number
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
  /** @deprecated blends two different daily ceilings into one number; use sendBudgets on TodayDashboard instead. Kept only so existing callers of getQueue() don't break. */
  todaySends: number
  /** @deprecated see todaySends. */
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

/** One of the two real daily send ceilings (Part 7 rule) — dm/followup and connection/upwork are tracked and limited separately, never blended into one number. */
export interface SendBudget {
  label: string
  types: MessageType[]
  used: number
  limit: number
}

/** A contacted lead 3+ days past its last send with no reply — the same threshold the followup_eligible notification trigger uses, computed here so the homepage can show the whole bucket, not just one notification at a time. */
export interface FollowupDue {
  lead: Lead
  daysSinceContact: number
}

/** This rep's reply rate against the team's, so "where do I stand" doesn't require a trip to /team. */
export interface MyRank {
  mine: RateMetric | null
  teamAverage: RateMetric
  /** 1-based position among reps with at least one send, best reply rate first; null if this rep has no sends yet. */
  position: number | null
  ofTotal: number
}

/** Upwork's own pipeline, summarized for the homepage the same way the lead queue is — Upwork jobs are a fully parallel, equally-scored pipeline that previously had zero homepage visibility. */
export interface UpworkSnapshot {
  queue: UpworkJob[]
  todayApplies: number
}

export interface ContentForToday {
  personaId: string
  personaName: string
  ideaTitle: string
  ideaAngle: string
  ideaReason: string
  draftId?: string
  draftCaption?: string
}

export interface TodayDashboard {
  mine: QueueData
  team: RateMetric
  sendBudgets: SendBudget[]
  notifications: NotificationLogEntry[]
  followupsDue: FollowupDue[]
  myRank: MyRank
  upwork: UpworkSnapshot
  contentForToday?: ContentForToday | null
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
  /** The organization this store is scoped to. */
  readonly organizationId: string
  /** The scoring rulebook for this organization. Loaded once per request. */
  getRulebook(): Promise<OrganizationRulebook | null>
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
  createPlay(input: { name: string; situation: string; templateShape: string }): Promise<Play>
  deletePlay(id: string): Promise<void>
  // dashboard / team
  getTodayDashboard(): Promise<TodayDashboard>
  getTeamStats(): Promise<TeamStats>
  getExtractionMetrics(): Promise<ExtractionMetrics>
  logExtractionRun(input: ModelCallLogInput): Promise<void>
  logHostCall(input: HostCallInput): Promise<void>
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
  // content engine
  createContentPersona(input: {
    repId: string
    displayName: string
    platforms: ContentPlatform[]
    voiceProfileId?: string | null
    humorStyle?: string
    valuesAndOpinions?: string[]
    admiredExamples?: string[]
  }): Promise<ContentPersona>
  updateContentPersonaProfile(input: {
    personaId: string
    humorStyle?: string
    valuesAndOpinions?: string[]
    admiredExamples?: string[]
  }): Promise<ContentPersona>
  updateContentPersona(input: {
    personaId: string
    personaRole?: string
    personaCompany?: string
    personaLocation?: string
    contentComfort?: string[]
    onboardingStep?: string
    onboardingCompleted?: boolean
  }): Promise<ContentPersona>
  listContentPersonas(repId: string): Promise<ContentPersona[]>
  getContentPersona(personaId: string): Promise<ContentPersona | null>
  deleteContentPersona(personaId: string): Promise<void>
  createContentPillar(input: {
    personaId: string
    pillarName: string
    description?: string
  }): Promise<ContentPillar>
  listContentPillars(personaId: string): Promise<ContentPillar[]>
  deleteContentPillar(pillarId: string): Promise<void>
  createContentDraft(input: {
    personaId: string
    pillarId?: string | null
    topicClusterId?: string | null
    researchFindingId?: string | null
    structureId?: string | null
    sourceKind?: 'answer' | 'conviction' | 'field_update' | 'idea'
    sourceMaterial: string
    platform: ContentPlatform
    caption: string
    hookScore?: number | null
    hookFeedback?: string
    selfCheckPassed?: boolean
    selfCheckNote?: string
    specificityHit?: boolean
    status?: ContentDraftStatus
  }): Promise<ContentDraft>
  listContentDrafts(personaId: string): Promise<ContentDraft[]>
  getContentDraft(draftId: string): Promise<ContentDraft | null>
  updateContentDraftCaption(draftId: string, caption: string): Promise<ContentDraft>
  updateContentDraftStatus(draftId: string, status: ContentDraftStatus): Promise<ContentDraft>
  updateContentDraft(input: {
    draftId: string
    caption?: string
    status?: ContentDraftStatus
    hookScore?: number | null
    hookFeedback?: string
    selfCheckPassed?: boolean
    selfCheckNote?: string
    specificityHit?: boolean
  }): Promise<ContentDraft>
  listContentHistory(personaId: string, limit?: number): Promise<ContentHistoryEntry[]>
  getContentHistoryEntry(historyId: string): Promise<ContentHistoryEntry | null>
  logContentPosted(input: {
    personaId: string
    pillarId: string | null
    topicClusterId?: string | null
    platform: ContentPlatform
    openingLine: string
  }): Promise<ContentHistoryEntry>
  markContentHistoryOutcome(historyId: string, ledToRealOutcome: boolean): Promise<ContentHistoryEntry>
  logContentMetrics(historyId: string, metrics: {
    likes?: number | null
    reach?: number | null
    comments?: number | null
    reposts?: number | null
    saves?: number | null
    profileVisits?: number | null
    followerDelta?: number | null
  }): Promise<ContentHistoryEntry>
  listPostStructures(): Promise<ContentPostStructure[]>
  createTrendingAngle(input: {
    pillarId: string
    angleDescription: string
    sourceNote?: string
    addedBy?: string | null
  }): Promise<TrendingAngle>
  getTrendingAngle(angleId: string): Promise<TrendingAngle | null>
  listTrendingAnglesByPillarIds(pillarIds: string[], opts?: { unusedOnly?: boolean }): Promise<TrendingAngle[]>
  markTrendingAngleUsed(angleId: string): Promise<TrendingAngle>
  countContentDraftsToday(personaId: string): Promise<number>
  createTopicCluster(input: {
    personaId: string
    clusterName: string
    description?: string
    sourceType?: 'profile' | 'answer' | 'research' | 'system'
    lastInputAt?: string | null
    lastResearchAt?: string | null
  }): Promise<TopicCluster>
  listTopicClusters(personaId: string): Promise<TopicCluster[]>
  touchTopicCluster(input: {
    topicClusterId: string
    lastInputAt?: string | null
    lastResearchAt?: string | null
  }): Promise<TopicCluster>
  createResearchFinding(input: {
    personaId: string
    topicClusterId: string
    finding: string
    sourceLabel: string
    sourceUrl: string
    sourcePublishedAt?: string | null
  }): Promise<ContentResearchFinding>
  listResearchFindings(personaId: string, opts?: { unusedOnly?: boolean; limit?: number }): Promise<ContentResearchFinding[]>
  markResearchFindingUsed(findingId: string): Promise<ContentResearchFinding>
  createContentDraftFeedback(input: {
    personaId: string
    draftId: string
    topicClusterId: string | null
    sourceKind: 'answer' | 'conviction' | 'field_update' | 'idea'
    reaction: 'posting' | 'not_for_me' | 'posting_after_edit'
    edited: boolean
    editSignals: string[]
  }): Promise<ContentDraftFeedback>
  listContentDraftFeedback(personaId: string, limit?: number): Promise<ContentDraftFeedback[]>
  // content profiles (Content DNA)
  createContentProfile(input: {
    personaId: string
    role?: string
    seniority?: string
    industries?: string[]
    audience?: string
  }): Promise<ContentProfile>
  getContentProfile(profileId: string): Promise<ContentProfile | null>
  getContentProfileByPersona(personaId: string): Promise<ContentProfile | null>
  updateContentProfile(profileId: string, patches: {
    role?: string
    seniority?: string
    industries?: string[]
    audience?: string
    expertise?: ContentProfileExpertise[]
    technologies?: ContentProfileTechnology[]
    goals?: ContentProfileGoal[]
    topicsCared?: ContentProfileTopic[]
    topicsAvoided?: ContentProfileTopic[]
    opinions?: ContentProfileOpinion[]
    projects?: ContentProfileProject[]
    experiences?: ContentProfileExperience[]
    writingCharacteristics?: ContentProfileWritingCharacteristics
    storytellingTendencies?: ContentProfileStorytellingTendency[]
    confidence?: number
  }): Promise<ContentProfile>
  deleteContentProfile(profileId: string): Promise<void>
  // content taste profiles
  getTasteProfile(personaId: string): Promise<{
    personaId: string
    preferences: { technicalVsHuman: number; opinionVsEducational: number; timelyVsEvergreen: number; shortVsDeep: number; seriousVsPlayful: number; personalVsUniversal: number }
    territoryAffinity: Record<string, number>
    totalInteractions: number
    lastSignalType: string | null
    lastSignalAt: string | null
    shortTerm: { technicalVsHuman: number; opinionVsEducational: number; timelyVsEvergreen: number; shortVsDeep: number; seriousVsPlayful: number; personalVsUniversal: number }
    shortTermWeight: number
  } | null>
  saveTasteProfile(personaId: string, profile: {
    preferences: { technicalVsHuman: number; opinionVsEducational: number; timelyVsEvergreen: number; shortVsDeep: number; seriousVsPlayful: number; personalVsUniversal: number }
    territoryAffinity: Record<string, number>
    totalInteractions: number
    lastSignalType?: string | null
    shortTerm: { technicalVsHuman: number; opinionVsEducational: number; timelyVsEvergreen: number; shortVsDeep: number; seriousVsPlayful: number; personalVsUniversal: number }
    shortTermWeight: number
  }): Promise<void>
  // content memories
  createContentMemory(input: {
    personaId: string
    memoryType: ContentMemoryType
    content: string
    sourceDraftId?: string | null
    sourceHistoryId?: string | null
  }): Promise<ContentMemory>
  listContentMemories(personaId: string, opts?: { memoryType?: ContentMemoryType; limit?: number }): Promise<ContentMemory[]>
  deleteContentMemory(memoryId: string): Promise<void>
  // content opportunities
  createContentOpportunity(input: {
    personaId: string
    opportunityType: ContentOpportunityType
    title: string
    description: string
    trigger: string
    sourceKind?: 'user_input' | 'interview' | 'research' | 'system_inferred' | 'history_pattern' | null
    sourceReference?: string | null
  }): Promise<ContentOpportunity>
  listContentOpportunities(personaId: string, opts?: { status?: string; limit?: number }): Promise<ContentOpportunity[]>
  getContentOpportunity(opportunityId: string): Promise<ContentOpportunity | null>
  updateContentOpportunity(opportunityId: string, patches: {
    qualification?: ContentOpportunityQualification
    qualified?: boolean
    status?: string
    dismissedAt?: string | null
    completedAt?: string | null
  }): Promise<ContentOpportunity>
  deleteContentOpportunity(opportunityId: string): Promise<void>
  // idea genomes
  createIdeaGenome(input: {
    personaId: string
    source: IdeaGenomeSource
    topic: string
    angle: string
    archetype: IdeaGenomeArchetype
    audience: string
    emotion?: string | null
    valueType?: 'practical' | 'emotional' | 'intellectual' | 'social' | null
    opportunityId?: string | null
  }): Promise<ContentIdeaGenome>
  getIdeaGenome(genomeId: string): Promise<ContentIdeaGenome | null>
  updateIdeaGenome(genomeId: string, patches: {
    novelty?: number
    evidenceStrength?: number
    personalSpecificity?: number
    relevance?: number
    conversationPotential?: number
    contentMemoryOverlap?: string[]
    differentiationNote?: string
    status?: string
    rejectionReason?: string | null
    draftId?: string | null
  }): Promise<ContentIdeaGenome>
  // evaluations
  createEvaluation(input: {
    draftId: string
    originality?: number
    personalSpecificity?: number
    usefulness?: number
    credibility?: number
    evidence?: number
    clarity?: number
    storytelling?: number
    voiceMatch?: number
    stopPotential?: number
    dwellPotential?: number
    commentPotential?: number
    savePotential?: number
    sharePotential?: number
    audienceRelevance?: number
    slopScore?: number
    genericProbability?: number
    qualityNotes?: Record<string, string>
    distributionNotes?: Record<string, string>
  }): Promise<ContentEvaluation>
  getEvaluation(evaluationId: string): Promise<ContentEvaluation | null>
  // interview sessions
  createInterviewSession(input: {
    personaId: string
    opportunityId?: string | null
    sessionType: 'onboarding' | 'opportunity_exploration' | 'post_qualification'
  }): Promise<ContentInterviewSession>
  getInterviewSession(sessionId: string): Promise<ContentInterviewSession | null>
  listInterviewSessions(personaId: string, opts?: { status?: string; limit?: number }): Promise<ContentInterviewSession[]>
  updateInterviewSession(sessionId: string, patches: {
    status?: string
    questionsAsked?: number
    informationGain?: number
    completedAt?: string | null
  }): Promise<ContentInterviewSession>
  createInterviewAnswer(input: {
    sessionId: string
    question: string
    answer: string
    informationGain?: number
  }): Promise<ContentInterviewAnswer>
  listInterviewAnswers(sessionId: string): Promise<ContentInterviewAnswer[]>
  // relay revenue intelligence
  getAssignedProfiles(): Promise<Profile[]>
  assignProfile(profileId: string): Promise<void>
  unassignProfile(profileId: string): Promise<void>
  listProofCards(profileId: string): Promise<ProofCard[]>
  upsertProofCard(input: {
    id?: string
    profileId: string
    capability: string
    strength: 'strong' | 'moderate' | 'weak'
    safeClaim: string
    sourceType: 'cv' | 'project' | 'portfolio' | 'case_study' | 'certification' | 'client_work' | 'approved_fact'
    sourceReference?: string | null
    tags?: string[]
    verified?: boolean
    forbiddenClaims?: string[]
  }): Promise<ProofCard>
  deleteProofCard(id: string): Promise<void>
  getConversationState(leadId: string): Promise<ConversationState | null>
  upsertConversationState(input: {
    leadId: string
    stage?: ConversationStage
    senderProfileId?: string | null
    lastStrategy?: string | null
    lastAngle?: string | null
    lastCta?: string | null
    followupCount?: number
    nextFollowupAt?: string | null
    wonAt?: string | null
    lostAt?: string | null
    lostReason?: string | null
  }): Promise<ConversationState>
  addSalesMemory(input: {
    memoryType: SalesMemoryType
    content: string
    leadId?: string | null
    profileId?: string | null
    industry?: string | null
    leadType?: string | null
    channel?: string | null
    stage?: string | null
    outcome?: 'positive' | 'negative' | 'neutral' | null
  }): Promise<SalesMemory>
  listSalesMemory(opts?: {
    memoryType?: SalesMemoryType
    profileId?: string | null
    industry?: string | null
    limit?: number
  }): Promise<SalesMemory[]>
  logEditLearning(input: {
    messageId: string | null
    originalText: string
    editedText: string
    editDistance: number
    lengthDelta: number
    greetingChanged: boolean
    ctaChanged: boolean
    proofRemoved: boolean
    madeShorter: boolean
    madeLonger: boolean
    formalityShift: 'more_formal' | 'less_formal' | 'same' | null
  }): Promise<void>
  updateLeadSenderProfile(leadId: string, senderProfileId: string | null): Promise<void>
  // content journey
  createContentJourneyEntry(input: {
    personaId: string
    eventType: string
    title: string
    description?: string
    eventDate?: string | null
    source?: string
  }): Promise<ContentJourneyEntry>
  listContentJourney(personaId: string, limit?: number): Promise<ContentJourneyEntry[]>
  deleteContentJourneyEntry(entryId: string): Promise<void>
  // quick capture
  createContentQuickCapture(input: {
    personaId: string
    rawInput: string
    suggestedAngles: unknown[]
    status?: string
  }): Promise<ContentQuickCapture>
  listContentQuickCaptures(personaId: string, limit?: number): Promise<ContentQuickCapture[]>
  updateQuickCaptureStatus(captureId: string, status: string): Promise<void>
}
