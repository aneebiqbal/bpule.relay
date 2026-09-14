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
  postedAt?: string | null
  remoteStatus?: string | null
  clientName?: string | null
  clientEmail?: string | null
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

export type ContentPlatform = 'linkedin' | 'x' | 'instagram'

export interface ContentSource {
  type: 'linkedin' | 'resume' | 'website' | 'portfolio' | 'bio' | 'previous_posts' | 'manual'
  label: string
  content: string
  parsedAt: string
  provenance: 'user_confirmed' | 'imported' | 'ai_inference'
}

export interface VoiceSample {
  label: string
  text: string
  style: string
}

export interface ContentJourneyEntry {
  id: string
  organizationId: string
  personaId: string
  eventType: 'joined' | 'shipped' | 'learned' | 'posted' | 'milestone' | 'project' | 'role_change' | 'other'
  title: string
  description: string
  eventDate: string | null
  source: 'user_entry' | 'imported' | 'ai_inferred' | 'confirmed'
  createdAt: string
}

export interface QuickCaptureAngle {
  angle: string
  type: 'technical_lesson' | 'story' | 'opinion' | 'observation' | 'how_to'
  title: string
}

export interface ContentQuickCapture {
  id: string
  organizationId: string
  personaId: string
  rawInput: string
  suggestedAngles: QuickCaptureAngle[]
  status: 'pending' | 'used' | 'dismissed'
  createdAt: string
}

export interface DailyContentBrief {
  personaId: string
  date: string
  pick: ContentIdeaCard | null
  alternatives: ContentIdeaCard[]
  timely: ContentIdeaCard | null
  refreshReason: string
}

export interface ContentIdeaCard {
  id: string
  title: string
  angle: string
  whyYou: string
  whyAudience: string
  sourceKind: 'expertise' | 'journey' | 'opinion' | 'trend' | 'project' | 'audience_gap' | 'evergreen'
  territory: string
  confidence: number
  territoryColor?: string
}

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
  contentProfileId: string | null
  personaRole?: string
  personaCompany?: string
  personaLocation?: string
  contentComfort?: string[]
  onboardingStep?: string
  onboardingCompleted?: boolean
  onboardingData?: Record<string, unknown>
  createdAt: string
}

export interface ContentProfileExpertise {
  area: string
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert'
  evidence: string
  updatedAt: string
}

export interface ContentProfileTechnology {
  name: string
  proficiency: 'learning' | 'using' | 'proficient' | 'expert'
  context: string
}

export interface ContentProfileGoal {
  description: string
  type: 'audience' | 'growth' | 'authority' | 'sales' | 'career' | 'other'
  updatedAt: string
}

export interface ContentProfileTopic {
  topic: string
  intensity: 'casual' | 'interested' | 'passionate'
  source: 'onboarding' | 'answer' | 'inference' | 'research'
}

export interface ContentProfileOpinion {
  belief: string
  strength: 'mild' | 'moderate' | 'strong'
  evidence: string
  source: 'onboarding' | 'answer' | 'inference'
  updatedAt: string
}

export interface ContentProfileProject {
  name: string
  description: string
  role: string
  outcome: string
  lessons: string[]
  updatedAt: string
}

export interface ContentProfileExperience {
  type: 'project' | 'mistake' | 'success' | 'decision' | 'lesson' | 'career'
  description: string
  lesson: string
  date: string | null
  updatedAt: string
}

export interface ContentProfileWritingCharacteristics {
  sentenceRhythm?: string
  vocabularyLevel?: string
  preferredLength?: string
  questionFrequency?: 'rare' | 'occasional' | 'frequent'
  dataUsage?: 'none' | 'light' | 'heavy'
  storyPreference?: 'abstract' | 'concrete' | 'mixed'
}

export interface ContentProfileStorytellingTendency {
  pattern: string
  frequency: 'rare' | 'occasional' | 'common'
  example: string
}

export interface ContentProfile {
  id: string
  organizationId: string
  personaId: string
  role: string
  seniority: string
  industries: string[]
  audience: string
  expertise: ContentProfileExpertise[]
  technologies: ContentProfileTechnology[]
  goals: ContentProfileGoal[]
  topicsCared: ContentProfileTopic[]
  topicsAvoided: ContentProfileTopic[]
  opinions: ContentProfileOpinion[]
  projects: ContentProfileProject[]
  experiences: ContentProfileExperience[]
  writingCharacteristics: ContentProfileWritingCharacteristics
  storytellingTendencies: ContentProfileStorytellingTendency[]
  confidence: number
  lastLearnedAt: string | null
  sources?: ContentSource[]
  audiences?: string[]
  territories?: string[]
  voiceSamples?: VoiceSample[]
  voiceSelection?: string
  contentGoals?: string[]
  createdAt: string
  updatedAt: string
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
  sourceKind: 'answer' | 'conviction' | 'field_update' | 'idea'
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
  structureId: string | null
  sourceKind: 'answer' | 'conviction' | 'field_update' | 'idea'
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
  updatedAt?: string
}

/** A real, logged performance snapshot — always optional, always manual entry. */
export interface ContentPostMetrics {
  likes: number | null
  reach: number | null
  comments: number | null
  reposts: number | null
  saves: number | null
  profileVisits: number | null
  followerDelta: number | null
  metricsLoggedAt: string | null
}

export interface ContentHistoryEntry extends ContentPostMetrics {
  id: string
  organizationId: string
  personaId: string
  pillarId: string | null
  topicClusterId: string | null
  platform: ContentPlatform
  openingLine: string
  postedAt: string
  ledToRealOutcome: boolean
  outcomeNotedAt: string | null
}

export type PostStructureCategory = 'contrarian_opener' | 'story_opener' | 'question_opener' | 'data_point_opener'

/** A curated, observed post shape used as generation scaffolding — never a performance promise. */
export interface ContentPostStructure {
  id: string
  category: PostStructureCategory
  structureName: string
  shape: string
  example: string
  createdAt: string
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

// ── Content Intelligence System types ──

export type ContentMemoryType =
  | 'topic_covered' | 'angle_used' | 'hook_used' | 'story_used'
  | 'claim_made' | 'opinion_expressed' | 'example_used' | 'archetype_used'

export interface ContentMemory {
  id: string
  organizationId: string
  personaId: string
  memoryType: ContentMemoryType
  content: string
  sourceDraftId: string | null
  sourceHistoryId: string | null
  createdAt: string
}

export type ContentOpportunityType =
  | 'recent_work' | 'production_lesson' | 'mistake_or_failure'
  | 'technical_decision' | 'changed_opinion' | 'useful_explanation'
  | 'industry_development' | 'contrarian_position' | 'behind_the_build'
  | 'customer_lesson' | 'career_lesson' | 'experiment' | 'unexpected_result'
  | 'timely_discussion'

export interface ContentOpportunityQualification {
  novelty?: number
  evidenceStrength?: number
  personalSpecificity?: number
  relevance?: number
  audienceFit?: number
  scrollStopPotential?: number
}

export interface ContentOpportunity {
  id: string
  organizationId: string
  personaId: string
  opportunityType: ContentOpportunityType
  title: string
  description: string
  trigger: string
  qualification: ContentOpportunityQualification
  qualified: boolean
  sourceKind: 'user_input' | 'interview' | 'research' | 'system_inferred' | 'history_pattern' | null
  sourceReference: string | null
  status: 'pending' | 'exploring' | 'interviewing' | 'qualifying' | 'in_forge' | 'completed' | 'dismissed'
  createdAt: string
  dismissedAt: string | null
  completedAt: string | null
}

export type IdeaGenomeSource =
  | 'personal_experience' | 'professional_expertise' | 'opinion'
  | 'industry_observation' | 'contrarian_take' | 'lesson_learned'
  | 'behind_the_build' | 'customer_insight' | 'experiment_result'

export type IdeaGenomeArchetype =
  | 'story_to_lesson' | 'lesson_direct' | 'contrarian_stand'
  | 'how_to' | 'behind_the_scenes' | 'hot_take' | 'data_driven'
  | 'question_engagement' | 'mistake_to_wins' | 'career_lesson'

export interface ContentIdeaGenome {
  id: string
  organizationId: string
  personaId: string
  source: IdeaGenomeSource
  topic: string
  angle: string
  archetype: IdeaGenomeArchetype
  audience: string
  emotion: string | null
  value_type: 'practical' | 'emotional' | 'intellectual' | 'social' | null
  novelty: number
  evidenceStrength: number
  personalSpecificity: number
  relevance: number
  conversationPotential: number
  contentMemoryOverlap: string[]
  differentiationNote: string
  status: 'candidate' | 'qualified' | 'rejected' | 'in_forge' | 'published' | 'archived'
  rejectionReason: string | null
  opportunityId: string | null
  draftId: string | null
  createdAt: string
  updatedAt: string
}

export interface ContentEvaluation {
  id: string
  draftId: string
  originality: number
  personalSpecificity: number
  usefulness: number
  credibility: number
  evidence: number
  clarity: number
  storytelling: number
  voiceMatch: number
  stopPotential: number
  dwellPotential: number
  commentPotential: number
  savePotential: number
  sharePotential: number
  audienceRelevance: number
  slopScore: number
  genericProbability: number
  qualityNotes: Record<string, string>
  distributionNotes: Record<string, string>
  createdAt: string
}

export interface ContentInterviewSession {
  id: string
  organizationId: string
  personaId: string
  opportunityId: string | null
  sessionType: 'onboarding' | 'opportunity_exploration' | 'post_qualification'
  status: 'active' | 'completed' | 'abandoned'
  questionsAsked: number
  informationGain: number
  createdAt: string
  completedAt: string | null
}

export interface ContentInterviewAnswer {
  id: string
  sessionId: string
  question: string
  answer: string
  informationGain: number
  createdAt: string
}

// ── Relay Revenue Intelligence System ───────────────────────────────────────

export interface ProfileAssignment {
  id: string
  repId: string
  profileId: string
  createdAt: string
}

export interface ProofCard {
  id: string
  organizationId: string
  profileId: string
  capability: string
  strength: 'strong' | 'moderate' | 'weak'
  safeClaim: string
  sourceType: 'cv' | 'project' | 'portfolio' | 'case_study' | 'certification' | 'client_work' | 'approved_fact'
  sourceReference: string | null
  tags: string[]
  verified: boolean
  forbiddenClaims: string[]
  createdAt: string
  updatedAt: string
}

export type ConversationStage =
  | 'new'
  | 'contacted'
  | 'replied'
  | 'qualifying'
  | 'interested'
  | 'meeting'
  | 'proposal'
  | 'negotiation'
  | 'won'
  | 'lost'

export interface ConversationState {
  id: string
  organizationId: string
  leadId: string
  stage: ConversationStage
  lastSentAt: string | null
  lastSentMessageId: string | null
  lastReplyAt: string | null
  senderProfileId: string | null
  lastStrategy: string | null
  lastAngle: string | null
  lastCta: string | null
  followupCount: number
  nextFollowupAt: string | null
  wonAt: string | null
  lostAt: string | null
  lostReason: string | null
  createdAt: string
  updatedAt: string
}

export type SalesMemoryType =
  | 'angle_used'
  | 'proof_used'
  | 'cta_used'
  | 'objection_seen'
  | 'won_reason'
  | 'lost_reason'
  | 'edit_pattern'
  | 'channel_preference'
  | 'industry_fit'
  | 'lead_type_fit'

export interface SalesMemory {
  id: string
  organizationId: string
  memoryType: SalesMemoryType
  content: string
  leadId: string | null
  profileId: string | null
  industry: string | null
  leadType: string | null
  channel: string | null
  stage: string | null
  outcome: 'positive' | 'negative' | 'neutral' | null
  occurrenceCount: number
  createdAt: string
  updatedAt: string
}

export interface EditLearning {
  id: string
  organizationId: string
  repId: string
  messageId: string | null
  originalText: string
  editedText: string
  editDistance: number | null
  lengthDelta: number | null
  greetingChanged: boolean
  ctaChanged: boolean
  proofRemoved: boolean
  madeShorter: boolean
  madeLonger: boolean
  formalityShift: 'more_formal' | 'less_formal' | 'same' | null
  createdAt: string
}

// Fact safety classification
export type FactSafety = 'VERIFIED_PUBLIC' | 'INFERRED' | 'WEAK_SIGNAL' | 'UNVERIFIED'

export type ClaimSafety = 'VERIFIED_PROFILE_PROOF' | 'APPROVED_CLAIM' | 'INFERRED' | 'UNSUPPORTED'

export interface SafeFact {
  fact: string
  safety: FactSafety
  source: string
  safeToMention: boolean
}

export interface MatchedProof {
  proofCard: ProofCard
  relevanceScore: number
  matchingTags: string[]
  safeClaim: string
}

// Outreach strategy
export type MessageMode =
  | 'observation_opener'
  | 'relevant_question'
  | 'useful_insight'
  | 'proof_led'
  | 'problem_recognition'
  | 'offer_small_win'
  | 'founder_to_founder'
  | 'technical_peer'
  | 'warm_conversational'
  | 'direct_opportunity'
  | 'referral_context'
  | 'followup'
  | 'reply'

export interface OutreachStrategy {
  leadContext: string
  safeTrigger: string
  probableNeed: string
  sender: string
  relevantProof: string[]
  messageGoal: string
  relationshipStage: string
  channel: string
  tone: string
  risk: string
  ctaStrategy: string
  mode: MessageMode
}
