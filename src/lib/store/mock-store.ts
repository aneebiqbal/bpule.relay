import type {
  ContentDraft,
  ContentDraftFeedback,
  ContentHistoryEntry,
  ContentPersona,
  ContentPillar,
  ContentPostStructure,
  ContentProfile,
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
  CsvImport,
  Fact,
  Lead,
  Message,
  MessageType,
  NotificationLogEntry,
  OrganizationRulebook,
  Outcome,
  Play,
  Profile,
  ProofItem,
  PushSubscription,
  Rep,
  TopicCluster,
  ContentResearchFinding,
  TrendingAngle,
  UpworkJob,
  UpworkMessage,
  Verdict,
  VoiceProfile,
} from '@/lib/domain/types'
import type {
  CreateLeadResult,
  DosageResult,
  ExtractionMetrics,
  FollowupDue,
  HostCallInput,
  ModelCallLogInput,
  NewLeadInput,
  QueueData,
  SaveDraftInput,
  ScoutStore,
  SendBudget,
  StoreContext,
  TeamStats,
  TodayDashboard,
  UpworkSnapshot,
} from '@/lib/store/types'
import { companyFuzzyKey, companyKey } from '@/lib/leads/normalize'
import { dailyConnectionSendLimit, dailySendLimit, messageTypeLimit } from '@/lib/ai/config'
import { computeRates, type RateBucket } from '@/lib/store/rates'
import { matchProofItemsByTags } from '@/lib/ai/proof-match'
import { pickPlayForSignal } from '@/lib/score/plays'

let seq = 0
const nextId = (prefix: string) => `${prefix}-${(++seq).toString(36)}`

/**
 * DEMO MODE store. In-memory only; every row is obviously fake placeholder
 * data so the app runs locally without Supabase. Swap to the Supabase store
 * by setting the Supabase env vars (see .env.local.example).
 */

const DEMO_ORG_ID = '11111111-1111-1111-1111-111111111111'

const t = (daysAgo: number, hour = 10) => {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

// Mirrors supabase/migrations/0031_seed_post_structures.sql — same curated,
// observed shapes, used only as generation scaffolding, never a promise.
const DEMO_POST_STRUCTURES: ContentPostStructure[] = [
  {
    id: 'struct-reversal',
    category: 'contrarian_opener',
    structureName: 'The reversal',
    shape: 'State the common belief in one line. Flatly contradict it in the next. Spend the rest of the post on the real reason, grounded in the source material, not abstract theory.',
    example: 'Everyone says ship fast and fix later. We shipped fast for two years and spent the third year fixing. Here\'s what that actually cost us.',
    createdAt: t(30),
  },
  {
    id: 'struct-quiet-disagreement',
    category: 'contrarian_opener',
    structureName: 'The quiet disagreement',
    shape: 'Open by naming what most people in the field do. State plainly that you do the opposite, then explain the one real situation that taught you why.',
    example: 'Most PMs write a spec before talking to an engineer. I stopped doing that after a project where the spec was wrong on page one.',
    createdAt: t(30),
  },
  {
    id: 'struct-specific-moment',
    category: 'story_opener',
    structureName: 'The specific moment',
    shape: 'Open on one concrete moment in time (a meeting, a message, a bug) with a real detail, not a summary. Let the lesson emerge from what happened, not be stated first.',
    example: 'Tuesday, 4pm. A client asked why the dashboard was still loading. It wasn\'t the query. It was the query we forgot to cache six months ago.',
    createdAt: t(30),
  },
  {
    id: 'struct-before-after',
    category: 'story_opener',
    structureName: 'Before and after',
    shape: 'Describe the state of things before, in one or two lines. Describe what changed. Let the contrast carry the point instead of explaining it.',
    example: 'Before: three people manually checking this every morning. After: one alert, one owner, zero manual checks. The change took an afternoon.',
    createdAt: t(30),
  },
  {
    id: 'struct-real-question',
    category: 'question_opener',
    structureName: 'The real question someone asked',
    shape: 'Open with an actual question a real person asked you or your team, attributed honestly (a client, a teammate, a comment) not a rhetorical one aimed at the reader.',
    example: 'A client asked me last week why we don\'t just use the cheapest option. Here\'s the honest answer I gave them.',
    createdAt: t(30),
  },
  {
    id: 'struct-surprising-number',
    category: 'data_point_opener',
    structureName: 'The number that surprised you',
    shape: 'Lead with one real, specific number from your own material. Explain what it actually measures before drawing any conclusion from it.',
    example: '14 seconds. That\'s how long our onboarding took before we cut it down. Here is what we removed.',
    createdAt: t(30),
  },
]

export function buildMockStore(ctx: StoreContext): ScoutStore {
  const rep = ctx.rep

  const reps: Rep[] = [
    { id: 'rep-hassan', name: 'Hassan (demo)', role: 'admin', organizationId: 'org-demo', createdAt: t(60) },
    { id: 'rep-ahmed', name: 'Ahmed (demo)', role: 'rep', organizationId: 'org-demo', createdAt: t(50) },
    { id: 'rep-nadia', name: 'Nadia (demo)', role: 'rep', organizationId: 'org-demo', createdAt: t(40) },
    { id: 'rep-samir', name: 'Samir (demo)', role: 'sourcer', organizationId: 'org-demo', createdAt: t(12) },
  ]

  const voiceProfiles: VoiceProfile[] = [
    {
      id: 'vp-ahmed',
      organizationId: DEMO_ORG_ID,
    repId: 'rep-ahmed',
      styleCard: {
        contractions: 'mostly_no',
        formality: 3,
        sentence_length: 'short',
        punctuation: 'standard',
        openers: 'statement',
        emoji_use: 'none',
        greeting: 'Hi',
        sign_off: 'Best regards',
        never_words: ['leverage', 'synergy', 'circle back'],
        preferred_words: ['fit', 'ship', 'plan'],
        summary: 'Short, direct, formal messages with no contractions and a classic sign-off.',
      },
      sampleSource: 'pasted_samples',
      calibratedAt: t(30),
    },
    {
      id: 'vp-nadia',
      organizationId: DEMO_ORG_ID,
    repId: 'rep-nadia',
      styleCard: {
        contractions: 'mostly_yes',
        formality: 2,
        sentence_length: 'medium',
        punctuation: 'relaxed',
        openers: 'question',
        emoji_use: 'none',
        greeting: 'Hey',
        sign_off: 'Cheers',
        never_words: ['dear', 'kindly', 'regards'],
        preferred_words: [],
        summary: 'Friendly, casual, quick questions, keeps it light and personal.',
      },
      sampleSource: 'quiz',
      calibratedAt: t(20),
    },
  ]

  const leads: Lead[] = [
    {
      id: 'lead-acme',
      organizationId: DEMO_ORG_ID,
      ownerRepId: 'rep-hassan',
      company: 'Acme Nail Polish Co',
    companyKey: companyKey('Acme Nail Polish Co'),
      contactName: 'Priya Sharma',
      contactTitle: 'Founder',
      url: 'https://example.com/acme',
      rawInput: 'FAKE demo lead. Priya Sharma, founder of Acme Nail Polish Co. Posted on LinkedIn: "We are drowning in a backlog and honestly open to a partner who can take the mobile app over." Last release was 14 months ago.',
      signalType: 7,
      signalEvidence: 'Founder posted publicly that the team is drowning in backlog and is open to a partner taking over the mobile app; last release 14 months ago.',
      verbatimQuote: 'We are honestly open to a partner who can take the mobile app over',
      score: 11,
      verdict: 'send',
      status: 'contacted',
      playId: 'play-rescue',
      tags: ['FAKE', 'demo'],
      createdAt: t(6),
    },
    {
      id: 'lead-beacon',
      organizationId: DEMO_ORG_ID,
      ownerRepId: 'rep-hassan',
      company: 'Beacon Hotel Booking',
    companyKey: companyKey('Beacon Hotel Booking'),
      contactName: 'Leo Fontaine',
      contactTitle: 'CTO',
      url: 'https://example.com/beacon',
      rawInput: 'FAKE demo lead. Beacon Hotel Booking lists 4 open engineering roles and 2 product roles. CTO Leo Fontaine.',
      signalType: 1,
      signalEvidence: 'Four open engineering roles and two product roles listed in the last month.',
      verbatimQuote: null,
      score: 10,
      verdict: 'send',
      status: 'new',
      playId: 'play-hiring',
      tags: ['FAKE', 'demo'],
      createdAt: t(1),
    },
    {
      id: 'lead-cedar',
      organizationId: DEMO_ORG_ID,
      ownerRepId: 'rep-ahmed',
      company: 'Cedar Tree Software',
    companyKey: companyKey('Cedar Tree Software'),
      contactName: 'Maya Osei',
      contactTitle: 'Head of Product',
      url: 'https://example.com/cedar',
      rawInput: 'FAKE demo lead. App store reviews complain the latest fix took six months. Head of Product Maya Osei.',
      signalType: 6,
      signalEvidence: 'Multiple recent reviews mention a simple bug reportedly taking six months to ship.',
      verbatimQuote: 'Six months for a one-line fix',
      score: 8,
      verdict: 'research_more',
      status: 'contacted',
      playId: 'play-rescue',
      tags: ['FAKE', 'demo'],
      createdAt: t(4),
    },
    {
      id: 'lead-delta',
      organizationId: DEMO_ORG_ID,
      ownerRepId: 'rep-hassan',
      company: 'Delta Bakery App',
    companyKey: companyKey('Delta Bakery App'),
      contactName: 'Marco Ruiz',
      contactTitle: 'Owner',
      url: 'https://example.com/delta',
      rawInput: 'FAKE demo lead. No updates in 2 years, low ratings. Owner Marco Ruiz said not interested in May.',
      signalType: 4,
      signalEvidence: 'App store listing last updated over two years ago, reviews ask for basic features.',
      verbatimQuote: null,
      score: 5,
      verdict: 'skip',
      status: 'no',
      playId: 'play-rescue',
      tags: ['FAKE', 'demo'],
      createdAt: t(30),
    },
    {
      id: 'lead-everest',
      organizationId: DEMO_ORG_ID,
      ownerRepId: 'rep-nadia',
      company: 'Everest Fitness Wear',
    companyKey: companyKey('Everest Fitness Wear'),
      contactName: 'Anna Kowalski',
      contactTitle: 'CEO',
      url: 'https://example.com/everest',
      rawInput: 'FAKE demo lead. Everest Fitness Wear closed a seed round and is expanding to Europe.',
      signalType: 3,
      signalEvidence: 'Closed a seed round and announced plans to expand to new markets.',
      verbatimQuote: null,
      score: 9,
      verdict: 'research_more',
      status: 'contacted',
      playId: 'play-price',
      tags: ['FAKE', 'demo'],
      createdAt: t(9),
    },
  ]

  const messages: Message[] = [
    {
      id: 'msg-acme-dm',
      organizationId: DEMO_ORG_ID,
      leadId: 'lead-acme',
    repId: 'rep-hassan',
      type: 'dm',
      draftText: null,
      sentText: 'Hey Priya, saw your post about the backlog. We help teams like yours take a product off their shoulders. Want a quick read on your mobile app? Best.',
      sentAt: t(6, 14),
      modelUsed: 'demo-seed',
      createdAt: t(6),
    },
    {
      id: 'msg-cedar-dm',
      organizationId: DEMO_ORG_ID,
      leadId: 'lead-cedar',
    repId: 'rep-ahmed',
      type: 'dm',
      draftText: null,
      sentText: 'Hi Maya, the review about the six month wait caught my eye. We ship faster than that for teams your size. Worth 15 minutes? Best regards.',
      sentAt: t(4, 11),
      modelUsed: 'demo-seed',
      createdAt: t(4),
    },
    {
      id: 'msg-everest-dm',
      organizationId: DEMO_ORG_ID,
      leadId: 'lead-everest',
    repId: 'rep-nadia',
      type: 'dm',
      draftText: null,
      sentText: 'Hey Anna, congrats on the round. When teams expand markets that fast, the app usually needs to keep up. Want to talk through it? Cheers.',
      sentAt: t(9, 9),
      modelUsed: 'demo-seed',
      createdAt: t(9),
    },
  ]

  const outcomes: Outcome[] = [
    { id: 'out-acme-read', organizationId: DEMO_ORG_ID, leadId: 'lead-acme', stage: 'read', occurredAt: t(5) },
    { id: 'out-acme-check', organizationId: DEMO_ORG_ID, leadId: 'lead-acme', stage: 'check', occurredAt: t(4) },
    { id: 'out-acme-replied', organizationId: DEMO_ORG_ID, leadId: 'lead-acme', stage: 'replied', occurredAt: t(4) },
    { id: 'out-cedar-read', organizationId: DEMO_ORG_ID, leadId: 'lead-cedar', stage: 'read', occurredAt: t(3) },
    { id: 'out-everest-replied', organizationId: DEMO_ORG_ID, leadId: 'lead-everest', stage: 'replied', occurredAt: t(7) },
  ]

  const facts: Fact[] = [
    { id: 'fact-years', organizationId: DEMO_ORG_ID, label: 'Years shipping (FAKE)', value: '8 years', factType: 'credential', addedBy: 'rep-hassan', createdAt: t(30) },
    { id: 'fact-price', organizationId: DEMO_ORG_ID, label: 'Typical senior project (FAKE)', value: '$14k per month', factType: 'price', addedBy: 'rep-hassan', createdAt: t(30) },
    { id: 'fact-reboot', organizationId: DEMO_ORG_ID, label: 'Reliable rewrites (FAKE)', value: 'ship a reboot without a rewrite', factType: 'credential', addedBy: 'rep-hassan', createdAt: t(30) },
    { id: 'fact-cases', organizationId: DEMO_ORG_ID, label: 'AI products shipped (FAKE)', value: '40+ products', factType: 'case', addedBy: 'rep-hassan', createdAt: t(30) },
    { id: 'fact-process', organizationId: DEMO_ORG_ID, label: 'Review pace (FAKE)', value: 'first plan in 10 days', factType: 'process', addedBy: 'rep-hassan', createdAt: t(30) },
  ]

  const plays: Play[] = [
    {
      id: 'play-rescue',
      organizationId: DEMO_ORG_ID,
    name: 'Play: rescue the backlog (FAKE)',
      situation: 'asking',
      templateShape: 'Addresses the specific bottleneck they mentioned, offers one concrete next step, keeps it to 3 sentences.',
    },
    {
      id: 'play-hiring',
      organizationId: DEMO_ORG_ID,
    name: 'Play: hiring ramp (FAKE)',
      situation: 'hiring',
      templateShape: 'Notices the hiring signal, names the capacity gap, asks if a delivery partner would let them keep hiring on the roadmap.',
    },
    {
      id: 'play-price',
      organizationId: DEMO_ORG_ID,
    name: 'Play: budget anchor (FAKE)',
      situation: 'funding',
      templateShape: 'Congratulates briefly, then gives a clear, budget-relevant fact and a low-friction next step.',
    },
  ]

  const profiles: Profile[] = [
    {
      id: 'profile-hassan-linkedin',
      organizationId: DEMO_ORG_ID,
    repId: 'rep-hassan',
      platform: 'linkedin',
      label: 'Hassan, LinkedIn',
      profileUrl: 'https://example.com/in/hassan',
      headline: 'Helping teams ship',
      cvPath: null,
      createdAt: t(20),
    },
    {
      id: 'profile-hassan-upwork',
      organizationId: DEMO_ORG_ID,
    repId: 'rep-hassan',
      platform: 'upwork',
      label: 'Hassan, Upwork',
      profileUrl: 'https://example.com/up/hassan',
      headline: 'Senior delivery partner',
      cvPath: null,
      createdAt: t(18),
    },
  ]

  const proofItems: ProofItem[] = [
    {
      id: 'proof-1',
      organizationId: DEMO_ORG_ID,
    profileId: 'profile-hassan-linkedin',
      clientNamed: true,
      clientName: 'Example Client',
      permissionOnFile: true,
      projectSummary: 'Took over a stalled trading dashboard and shipped the compliance module. (FAKE)',
      reviewQuote: 'Turned our backlog into a roadmap. (FAKE review quote)',
      tags: ['nextjs', 'react', 'qa', 'migration'],
      createdAt: t(15),
    },
    {
      id: 'proof-2',
      organizationId: DEMO_ORG_ID,
    profileId: 'profile-hassan-upwork',
      clientNamed: false,
      clientName: null,
      permissionOnFile: false,
      projectSummary: 'Built an internal QA tool for a logistics team. (FAKE, no client named)',
      reviewQuote: null,
      tags: ['python', 'automation', 'api'],
      createdAt: t(12),
    },
  ]

  const upworkJobs: UpworkJob[] = [
    {
      id: 'upwork-fintech-rebuild',
      organizationId: DEMO_ORG_ID,
    ownerRepId: 'rep-hassan',
      title: 'Rebuild fintech onboarding flow (FAKE demo job)',
      description: 'FAKE demo Upwork job. Client needs a KYC onboarding rebuild, previous dev went unresponsive mid-project.',
      budgetMin: 4000,
      budgetMax: 8000,
      hourlyRateMin: null,
      hourlyRateMax: null,
      proposalCount: 6,
      connectsCost: 4,
      requiredSkills: ['react', 'nodejs', 'stripe'],
      urgencySignal: 'Previous developer went unresponsive mid-project.',
      score: 8,
      verdict: 'apply',
      status: 'new',
      extractedFields: null,
      rawInput: null,
      tags: ['fintech', 'react', 'nodejs'],
      createdAt: t(1),
    },
    {
      id: 'upwork-dashboard-perf',
      organizationId: DEMO_ORG_ID,
    ownerRepId: 'rep-hassan',
      title: 'Speed up analytics dashboard (FAKE demo job)',
      description: 'FAKE demo Upwork job. Dashboard queries take 20s+, client wants it under 2s.',
      budgetMin: null,
      budgetMax: null,
      hourlyRateMin: 60,
      hourlyRateMax: 90,
      proposalCount: 3,
      connectsCost: 2,
      requiredSkills: ['postgres', 'react'],
      urgencySignal: null,
      score: 6,
      verdict: 'apply_if_connects',
      status: 'drafted',
      extractedFields: null,
      rawInput: null,
      tags: ['performance', 'postgres'],
      createdAt: t(2),
    },
  ]
  const upworkMessages: UpworkMessage[] = []
  const pushSubs: PushSubscription[] = []
  const notifications: NotificationLogEntry[] = [
    {
      id: 'notif-acme-reply',
      organizationId: DEMO_ORG_ID,
    repId: 'rep-hassan',
      type: 'reply',
      payload: { lead_id: 'lead-acme', stage: 'replied', occurred_at: t(4) },
      read: false,
      createdAt: t(4),
    },
  ]
  const csvImports: CsvImport[] = []
  // content engine
  const contentPersonas: ContentPersona[] = []
  const contentProfiles: ContentProfile[] = []
  const contentPillars: ContentPillar[] = []
  const topicClusters: TopicCluster[] = []
  const contentDrafts: ContentDraft[] = []
  const contentDraftFeedback: ContentDraftFeedback[] = []
  const contentHistoryEntries: ContentHistoryEntry[] = []
  const trendingAngles: TrendingAngle[] = []
  const researchFindings: ContentResearchFinding[] = []
  const contentMemories: ContentMemory[] = []
  const contentOpportunities: ContentOpportunity[] = []
  const contentIdeaGenomes: ContentIdeaGenome[] = []
  const contentEvaluations: ContentEvaluation[] = []
  const interviewSessions: ContentInterviewSession[] = []
  const interviewAnswers: ContentInterviewAnswer[] = []
  const extractionRuns: Array<{
    task: 'extract' | 'draft'
    success: boolean
    latencyMs: number
    model: string
    costTier: 'tier1' | 'tier2' | 'tier3' | 'tier4' | null
    costUsd: number
    error: string | null
    createdAt: string
  }> = []

  function bucketByOwner(ownerId: string): RateBucket[] {
    return leads
      .filter((l) => l.ownerRepId === ownerId)
      .map((lead) => ({
        lead,
        sentMessages: messages.filter((m) => m.leadId === lead.id),
        outcomes: outcomes.filter((o) => o.leadId === lead.id),
      }))
  }

  function dedupe(company: string): CreateLeadResult | null {
    const key = companyKey(company)
    const fuzzy = companyFuzzyKey(company)

    const priorNo = leads.find(
      (l) =>
        l.companyKey === key &&
        (l.status === 'no' || l.status === 'dead'),
    )
    if (priorNo) {
      const owner = reps.find((r) => r.id === priorNo.ownerRepId)
      return {
        blocked: true,
        reason: 'This company was already flagged no by the team. It is locked for everyone.',
        existingOwnerName: owner?.name ?? 'another rep',
      }
    }

    const existing = leads.find((l) => l.companyKey === key && l.status !== 'dead')
    const fuzzyMatch = leads.find((l) => l.companyKey !== key && companyFuzzyKey(l.company) === fuzzy && l.status !== 'dead')
    const hit = existing ?? fuzzyMatch
    if (hit) {
      const owner = reps.find((r) => r.id === hit.ownerRepId)
      return {
        blocked: true,
        reason: `This company already exists on the board.`,
        existingOwnerName: owner?.name ?? 'another rep',
      }
    }
    return null
  }

  const demoRulebook: OrganizationRulebook = {
    organizationId: DEMO_ORG_ID,
    signals: [
      { id: 1, name: 'hiring', weight: 6, short: 'Hiring ramp', description: 'Recent job posts.', example: 'Three open engineering roles.' },
      { id: 2, name: 'understaffed', weight: 5, short: 'Tiny team', description: 'A solo founder or very small team.', example: 'Single developer credited.' },
      { id: 3, name: 'funding', weight: 4, short: 'Raised money', description: 'A recent funding round.', example: 'Announced a seed round.' },
      { id: 4, name: 'stale', weight: 4, short: 'Stale product', description: 'No meaningful updates for months.', example: 'Last update was over a year ago.' },
      { id: 5, name: 'weak_stack', weight: 3, short: 'Aging stack', description: 'Dated or weak technology.', example: 'Unsupported framework version.' },
      { id: 6, name: 'pain', weight: 5, short: 'Recorded pain', description: 'Complaints about delivery.', example: 'Six month wait for a fix.' },
      { id: 7, name: 'asking', weight: 7, short: 'Asking for help', description: 'Publicly asking for help.', example: 'Looking for a dev shop.' },
    ],
    verdictThresholds: { send: { min: 10, max: 12 }, research_more: { min: 7, max: 9 }, skip: { min: 0, max: 6 } },
    maxSignalWeight: 7,
    maxCompleteness: 5,
    confidenceSendThreshold: 72,
  }

  return {
    organizationId: DEMO_ORG_ID,
    async getRulebook() {
      return demoRulebook
    },
    async createLead(input: NewLeadInput): Promise<CreateLeadResult> {
      const blocked = dedupe(input.company)
      if (blocked) return blocked
      const lead: Lead = {
        id: nextId('lead'),
        organizationId: DEMO_ORG_ID,
        ownerRepId: rep.id,
        company: input.company.trim(),
    companyKey: companyKey(input.company),
        contactName: input.contactName?.trim() || null,
        contactTitle: input.contactTitle?.trim() || null,
        titleRaw: input.titleRaw?.trim() || null,
        locationRaw: input.locationRaw?.trim() || null,
        url: input.url?.trim() || null,
        rawInput: input.rawInput?.trim() || null,
        roleCategory: input.roleCategory ?? null,
        marketRegion: input.marketRegion ?? null,
        extractionConfidence: input.extractionConfidence ?? null,
        extractionProfile: input.extractionProfile ?? null,
        signalType: input.signalType,
        signalEvidence: input.signalEvidence.trim(),
        verbatimQuote: input.verbatimQuote?.trim() || null,
        score: null,
        verdict: null,
        status: 'new',
        playId: pickPlayForSignal(plays, input.signalType)?.id ?? null,
        tags: input.tags ?? ['FAKE', 'demo'],
        createdAt: new Date().toISOString(),
      }
      leads.unshift(lead)
      return { blocked: false, lead }
    },
    async updateLeadScore(id, score) {
      const lead = leads.find((l) => l.id === id)
      if (!lead) throw new Error('Lead not found')
      lead.score = score.total
      lead.verdict = score.verdict as Verdict
    },
    async updateLeadTags(id, tags) {
      const lead = leads.find((l) => l.id === id)
      if (!lead) throw new Error('Lead not found')
      lead.tags = tags
    },
    async getLead(id: string) {
      const lead = leads.find((l) => l.id === id)
      if (!lead) return null
      return {
        ...lead,
        messages: messages
          .filter((m) => m.leadId === id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        outcomes: outcomes.filter((o) => o.leadId === id),
      }
    },
    async listOwnedLeads() {
      return leads
        .filter((l) => l.ownerRepId === rep.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },
    async getQueue(): Promise<QueueData> {
      const owned = leads.filter((l) => l.ownerRepId === rep.id)
      const todaySends = messages.filter((m) => {
        if (!m.sentAt) return false
        const sent = new Date(m.sentAt)
        const now = new Date()
        const leadOwner = leads.find((l) => l.id === m.leadId)?.ownerRepId
        return (
          leadOwner === rep.id &&
          sent.getFullYear() === now.getFullYear() &&
          sent.getMonth() === now.getMonth() &&
          sent.getDate() === now.getDate()
        )
      }).length
      const queue = owned
        .filter((l) => l.status === 'new' || l.status === 'contacted')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      const replies = owned
        .filter((l) => l.status === 'replied')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      return { todaySends, dailyLimit: dailySendLimit(), queue, replies }
    },
    async saveDraft(input: SaveDraftInput) {
      const msg: Message = {
        id: nextId('msg'),
        organizationId: DEMO_ORG_ID,
        leadId: input.leadId,
    repId: rep.id,
        type: input.type,
        draftText: input.draftText,
        sentText: null,
        sentAt: null,
        modelUsed: input.modelUsed,
        createdAt: new Date().toISOString(),
      }
      messages.unshift(msg)
      return msg
    },
    async markContacted(
      leadId: string,
      sentText: string,
      messageType: MessageType = 'dm',
    ): Promise<DosageResult> {
      const lead = leads.find((l) => l.id === leadId)
      if (!lead) throw new Error('Lead not found')
      if (lead.ownerRepId !== rep.id) {
        throw new Error('You are not the owner of this lead, so it could not be marked contacted.')
      }
      if (lead.status === 'no' || lead.status === 'dead') {
        throw new Error('This lead is locked and cannot be contacted.')
      }
      const type = messageType
      const todaySends = await (async () => {
        const now = new Date()
        return messages.filter((m) => {
          if (!m.sentAt || m.type !== type || leads.find((l) => l.id === m.leadId)?.ownerRepId !== rep.id) return false
          const s = new Date(m.sentAt)
          return s.getFullYear() === now.getFullYear() && s.getMonth() === now.getMonth() && s.getDate() === now.getDate()
        }).length
      })()

      const limit = messageTypeLimit(type)
      if (todaySends >= limit) {
        return {
          allowed: false,
          todaySends,
          limit,
          message: `Daily ceiling of ${limit} reached for ${type} messages.`,
        }
      }

      lead.status = type === 'followup' ? 'followed_up' : 'contacted'
      messages.push({
        id: nextId('msg'),
        organizationId: DEMO_ORG_ID,
        leadId,
        repId: rep.id,
        type,
        draftText: null,
        sentText,
        sentAt: new Date().toISOString(),
        modelUsed: null,
        createdAt: new Date().toISOString(),
      })
      return { allowed: true, todaySends: todaySends + 1, limit }
    },
    async getVoiceProfile() {
      return voiceProfiles.find((v) => v.repId === rep.id) ?? null
    },
    async setVoiceProfile(styleCard, sampleSource) {
      const existing = voiceProfiles.find((v) => v.repId === rep.id)
      const vp: VoiceProfile = {
        id: existing?.id ?? nextId('vp'),
        organizationId: DEMO_ORG_ID,
        repId: rep.id,
        styleCard,
        sampleSource,
        calibratedAt: new Date().toISOString(),
      }
      if (existing) {
        Object.assign(existing, vp)
        return existing
      }
      voiceProfiles.push(vp)
      return vp
    },
    async listFacts() {
      return [...facts].sort((a, b) => a.label.localeCompare(b.label))
    },
    async upsertFact(input) {
      if (rep.role !== 'admin') throw new Error('Admin only')
      let fact = facts.find((f) => f.id === input.id)
      if (fact) {
        fact.label = input.label
        fact.value = input.value
        fact.factType = input.factType ?? null
        return fact
      }
      fact = {
        id: nextId('fact'),
        organizationId: DEMO_ORG_ID,
        label: input.label,
        value: input.value,
        factType: input.factType ?? null,
        addedBy: rep.id,
        createdAt: new Date().toISOString(),
      }
      facts.push(fact)
      return fact
    },
    async deleteFact(id) {
      if (rep.role !== 'admin') throw new Error('Admin only')
      const idx = facts.findIndex((f) => f.id === id)
      if (idx >= 0) facts.splice(idx, 1)
    },
    async listPlays() {
      return [...plays]
    },
    async createPlay(input) {
      const play = {
        id: nextId('play'),
        organizationId: DEMO_ORG_ID,
        name: input.name,
        situation: input.situation,
        templateShape: input.templateShape,
      }
      plays.push(play)
      return play
    },
    async deletePlay(id) {
      const idx = plays.findIndex((p) => p.id === id)
      if (idx >= 0) plays.splice(idx, 1)
    },
    async listAllReps() {
      return [...reps].sort((a, b) => a.name.localeCompare(b.name))
    },
    async listProfiles() {
      return profiles
        .filter((p) => p.repId === rep.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    },
    async getProfile(id: string) {
      const p = profiles.find((x) => x.id === id)
      return p && p.repId === rep.id ? p : null
    },
    async upsertProfile(input) {
      const existing = input.id ? profiles.find((p) => p.id === input.id && p.repId === rep.id) : null
      if (existing) {
        existing.platform = input.platform
        existing.label = input.label ?? null
        existing.profileUrl = input.profileUrl ?? null
        existing.headline = input.headline ?? null
        existing.cvPath = input.cvPath ?? null
        return existing
      }
      const profile: Profile = {
        id: nextId('profile'),
        organizationId: DEMO_ORG_ID,
    repId: rep.id,
        platform: input.platform,
        label: input.label ?? null,
        profileUrl: input.profileUrl ?? null,
        headline: input.headline ?? null,
        cvPath: input.cvPath ?? null,
        createdAt: new Date().toISOString(),
      }
      profiles.push(profile)
      return profile
    },
    async deleteProfile(id: string) {
      const idx = profiles.findIndex((p) => p.id === id && p.repId === rep.id)
      if (idx >= 0) profiles.splice(idx, 1)
    },
    async listAllProfiles() {
      return [...profiles].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    },
    async upsertProfileAdmin(input) {
      if (rep.role !== 'admin') throw new Error('Admin only')
      const existing = input.id ? profiles.find((p) => p.id === input.id) : null
      if (existing) {
        existing.platform = input.platform
        existing.label = input.label ?? null
        existing.profileUrl = input.profileUrl ?? null
        existing.headline = input.headline ?? null
        existing.cvPath = input.cvPath ?? null
        return existing
      }
      const profile: Profile = {
        id: nextId('profile'),
        organizationId: DEMO_ORG_ID,
        repId: input.repId,
        platform: input.platform,
        label: input.label ?? null,
        profileUrl: input.profileUrl ?? null,
        headline: input.headline ?? null,
        cvPath: input.cvPath ?? null,
        createdAt: new Date().toISOString(),
      }
      profiles.push(profile)
      return profile
    },
    async deleteProfileAdmin(id: string) {
      if (rep.role !== 'admin') throw new Error('Admin only')
      const idx = profiles.findIndex((p) => p.id === id)
      if (idx >= 0) profiles.splice(idx, 1)
    },
    async listProofItems(profileId: string) {
      return proofItems.filter((x) => x.profileId === profileId)
    },
    async listProofItemsAdmin(profileId: string) {
      if (rep.role !== 'admin') throw new Error('Admin only')
      return proofItems.filter((x) => x.profileId === profileId)
    },
    async upsertProofItem(input) {
      const permission = Boolean(input.permissionOnFile)
      const clientName = permission ? (input.clientName ?? null) : null
      const existing = input.id ? proofItems.find((x) => x.id === input.id) : null
      if (existing) {
        existing.clientNamed = Boolean(input.clientNamed)
        existing.permissionOnFile = permission
        existing.clientName = clientName
        existing.projectSummary = input.projectSummary
        existing.reviewQuote = input.reviewQuote ?? null
        existing.tags = input.tags ?? []
        return existing
      }
      const item: ProofItem = {
        id: nextId('proof'),
        organizationId: DEMO_ORG_ID,
    profileId: input.profileId,
        clientNamed: Boolean(input.clientNamed),
        permissionOnFile: permission,
        clientName,
        projectSummary: input.projectSummary,
        reviewQuote: input.reviewQuote ?? null,
        tags: input.tags ?? [],
        createdAt: new Date().toISOString(),
      }
      proofItems.push(item)
      return item
    },
    async deleteProofItem(id: string) {
      const idx = proofItems.findIndex((x) => x.id === id)
      if (idx >= 0) proofItems.splice(idx, 1)
    },
    async upsertProofItemAdmin(input) {
      if (rep.role !== 'admin') throw new Error('Admin only')
      const permission = Boolean(input.permissionOnFile)
      const clientName = permission ? (input.clientName ?? null) : null
      const existing = input.id ? proofItems.find((x) => x.id === input.id) : null
      if (existing) {
        existing.clientNamed = Boolean(input.clientNamed)
        existing.permissionOnFile = permission
        existing.clientName = clientName
        existing.projectSummary = input.projectSummary
        existing.reviewQuote = input.reviewQuote ?? null
        existing.tags = input.tags ?? []
        return existing
      }
      const item: ProofItem = {
        id: nextId('proof'),
        organizationId: DEMO_ORG_ID,
    profileId: input.profileId,
        clientNamed: Boolean(input.clientNamed),
        permissionOnFile: permission,
        clientName,
        projectSummary: input.projectSummary,
        reviewQuote: input.reviewQuote ?? null,
        tags: input.tags ?? [],
        createdAt: new Date().toISOString(),
      }
      proofItems.push(item)
      return item
    },
    async deleteProofItemAdmin(id: string) {
      if (rep.role !== 'admin') throw new Error('Admin only')
      const idx = proofItems.findIndex((x) => x.id === id)
      if (idx >= 0) proofItems.splice(idx, 1)
    },
    async matchProofItems(tags: string[], limit = 2) {
      return matchProofItemsByTags(proofItems, tags, limit)
    },
    async getTodayDashboard(): Promise<TodayDashboard> {
      const mine = await this.getQueue()
      const team = computeRates(leads.map((lead) => ({
        lead,
        sentMessages: messages.filter((m) => m.leadId === lead.id),
        outcomes: outcomes.filter((o) => o.leadId === lead.id),
      })))

      const isToday = (iso: string | null) => {
        if (!iso) return false
        const d = new Date(iso)
        const now = new Date()
        return (
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth() &&
          d.getDate() === now.getDate()
        )
      }
      const ownedIds = new Set(leads.filter((l) => l.ownerRepId === rep.id).map((l) => l.id))
      const dmFollowupSent = messages.filter(
        (m) => ownedIds.has(m.leadId) && (m.type === 'dm' || m.type === 'followup') && isToday(m.sentAt),
      ).length
      const connectionSent = messages.filter(
        (m) => ownedIds.has(m.leadId) && m.type === 'connection' && isToday(m.sentAt),
      ).length
      const upworkApplies = upworkMessages.filter(
        (m) => m.repId === rep.id && isToday(m.sentAt),
      ).length

      const sendBudgets: SendBudget[] = [
        {
          label: 'DM & follow-up',
          types: ['dm', 'followup'],
          used: dmFollowupSent,
          limit: dailySendLimit(),
        },
        {
          label: 'Connection & Upwork',
          types: ['connection', 'upwork'],
          used: connectionSent + upworkApplies,
          limit: dailyConnectionSendLimit(),
        },
      ]

      const notifications = await this.listNotifications()

      const contacted = leads.filter((l) => l.ownerRepId === rep.id && l.status === 'contacted')
      const now = Date.now()
      const followupsDue: FollowupDue[] = contacted
        .map((lead) => {
          const hasReply = outcomes.some((o) => o.leadId === lead.id && o.stage === 'replied')
          if (hasReply) return null
          const sent = messages
            .filter((m) => m.leadId === lead.id && m.sentAt)
            .sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? ''))[0]
          if (!sent?.sentAt) return null
          const daysSinceContact = Math.floor((now - new Date(sent.sentAt).getTime()) / 86_400_000)
          return daysSinceContact >= 3 ? { lead, daysSinceContact } : null
        })
        .filter((x): x is FollowupDue => x !== null)
        .sort((a, b) => b.daysSinceContact - a.daysSinceContact)

      const teamStats = await this.getTeamStats()
      const mineRow = teamStats.perRep.find((r) => r.rep.id === rep.id)
      const withSends = teamStats.perRep.filter((r) => r.sent > 0 && r.replyRate !== null)
      const ranked = [...withSends].sort((a, b) => (b.replyRate ?? 0) - (a.replyRate ?? 0))
      const position = mineRow && mineRow.sent > 0 ? ranked.findIndex((r) => r.rep.id === rep.id) + 1 : null
      const myRank = {
        mine: mineRow ?? null,
        teamAverage: teamStats.overall,
        position: position && position > 0 ? position : null,
        ofTotal: ranked.length,
      }

      const upworkQueue = upworkJobs
        .filter((j) => j.status === 'new' || j.status === 'drafted')
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      const upwork: UpworkSnapshot = { queue: upworkQueue, todayApplies: upworkApplies }

      return { mine: { ...mine, queue: mine.queue, replies: mine.replies }, team, sendBudgets, notifications, followupsDue, myRank, upwork }
    },
    async getTeamStats(): Promise<TeamStats> {
      const buckets = leads.map((lead) => ({
        lead,
        sentMessages: messages.filter((m) => m.leadId === lead.id),
        outcomes: outcomes.filter((o) => o.leadId === lead.id),
      }))
      const overall = computeRates(buckets)
      const perRep = reps
        .filter((r) => r.role !== 'sourcer')
        .map((r) => ({
          rep: r,
          ...computeRates(bucketByOwner(r.id)),
        }))
        .filter((row) => row.sent > 0 || row.replyRate !== null)
      const playGroups = new Map<string, RateBucket[]>()
      for (const b of buckets) {
        const key = b.lead.playId ?? ''
        if (!playGroups.has(key)) playGroups.set(key, [])
        playGroups.get(key)!.push(b)
      }
      const perPlay = [...playGroups.entries()]
        .map(([key, group]) => ({
          play: key ? (plays.find((p) => p.id === key) ?? null) : null,
          ...computeRates(group),
        }))
        .filter((row) => row.sent > 0 || row.replyRate !== null)
        .sort((a, b) => (a.play?.name ?? 'No play').localeCompare(b.play?.name ?? 'No play'))
      return { overall, perRep, perPlay }
    },
    async logHostCall(input: HostCallInput) {
      // No-op in demo mode; this table is for production observability.
    },
    async logExtractionRun(input: ModelCallLogInput) {
      extractionRuns.push({
        task: input.task,
        success: input.success,
        latencyMs: Math.max(0, Math.round(input.latencyMs)),
        model: input.model,
        costTier: input.costTier ?? null,
        costUsd: input.costUsd ?? 0,
        error: input.error ?? null,
        createdAt: new Date().toISOString(),
      })
    },
    async getExtractionMetrics(): Promise<ExtractionMetrics> {
      const since = Date.now() - 7 * 24 * 60 * 60 * 1000
      const rows = extractionRuns.filter((r) => new Date(r.createdAt).getTime() >= since)
      const total = rows.length
      const failures = rows.filter((r) => !r.success).length
      const failureRate = total > 0 ? failures / total : 0
      const latencies = rows
        .map((r) => r.latencyMs)
        .filter((n) => Number.isFinite(n) && n > 0)
        .sort((a, b) => a - b)
      const avgLatencyMs =
        latencies.length > 0
          ? Math.round(latencies.reduce((sum, n) => sum + n, 0) / latencies.length)
          : 0
      const p95LatencyMs =
        latencies.length > 0
          ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))]
          : 0
      const costByTier = { tier1: 0, tier2: 0, tier3: 0, tier4: 0 }
      const requestsByTier = { tier1: 0, tier2: 0, tier3: 0, tier4: 0 }
      for (const r of rows) {
        if (r.costTier) {
          costByTier[r.costTier] += r.costUsd
          requestsByTier[r.costTier] += 1
        }
      }
      const totalCostUsd = Object.values(costByTier).reduce((sum, n) => sum + n, 0)
      return { total, failures, failureRate, avgLatencyMs, p95LatencyMs, costByTier, totalCostUsd, requestsByTier }
    },
    async listAllLeadsAdmin() {
      return leads
    },
    async matchProofItemsByEmbedding() {
      return []
    },
    async listGoldenSet() {
      return []
    },
    async addGoldenCase() {
      throw new Error('Admin only')
    },
    async removeGoldenCase() {
      throw new Error('Admin only')
    },
    async listEvalRuns() {
      return []
    },
    async saveEvalRun() {
      throw new Error('Admin only')
    },
    async listFewShotWins() {
      return []
    },
    async refreshFewShotWins() {
      return 0
    },
    async createUpworkJob(input) {
      const job: UpworkJob = {
        id: nextId('upwork'),
        organizationId: DEMO_ORG_ID,
    ownerRepId: rep.id,
        title: input.title.trim(),
        description: input.description.trim(),
        budgetMin: input.budgetMin ?? null,
        budgetMax: input.budgetMax ?? null,
        hourlyRateMin: input.hourlyRateMin ?? null,
        hourlyRateMax: input.hourlyRateMax ?? null,
        proposalCount: input.proposalCount ?? null,
        connectsCost: input.connectsCost ?? 0,
        requiredSkills: input.requiredSkills ?? [],
        urgencySignal: input.urgencySignal ?? null,
        score: null,
        verdict: null,
        status: 'new',
        extractedFields: null,
        rawInput: input.rawInput ?? null,
        tags: input.tags ?? [],
        createdAt: new Date().toISOString(),
      }
      upworkJobs.unshift(job)
      return job
    },
    async getUpworkJob(id: string) {
      const job = upworkJobs.find((j) => j.id === id)
      if (!job) return null
      return {
        ...job,
        messages: upworkMessages.filter((m) => m.jobId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      }
    },
    async listUpworkJobs() {
      return upworkJobs.filter((j) => j.ownerRepId === rep.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },
    async updateUpworkJobScore(id, score) {
      const job = upworkJobs.find((j) => j.id === id)
      if (job) {
        job.score = score.total
        job.verdict = score.verdict
      }
    },
    async saveUpworkDraft(input) {
      const msg: UpworkMessage = {
        id: nextId('umsg'),
        organizationId: DEMO_ORG_ID,
        jobId: input.jobId,
    repId: rep.id,
        type: input.type,
        draftText: input.draftText,
        sentText: null,
        sentAt: null,
        modelUsed: input.modelUsed,
        createdAt: new Date().toISOString(),
      }
      upworkMessages.unshift(msg)
      return msg
    },
    async markUpworkApplied(jobId, sentText, type = 'cover') {
      const job = upworkJobs.find((j) => j.id === jobId)
      if (job) job.status = 'applied'
      upworkMessages.push({
        id: nextId('umsg'),
        organizationId: DEMO_ORG_ID,
        jobId,
        repId: rep.id,
        type,
        draftText: null,
        sentText,
        sentAt: new Date().toISOString(),
        modelUsed: null,
        createdAt: new Date().toISOString(),
      })
    },
    async logCsvImport(input) {
      const imp: CsvImport = {
        id: nextId('csv'),
        organizationId: DEMO_ORG_ID,
    repId: rep.id,
        fileName: input.fileName ?? null,
        totalRows: input.totalRows,
        imported: input.imported,
        duplicates: input.duplicates,
        invalid: input.invalid,
        details: input.details ?? null,
        createdAt: new Date().toISOString(),
      }
      csvImports.unshift(imp)
      return imp
    },
    async listCsvImports() {
      return csvImports.filter((c) => c.repId === rep.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },
    async archiveSearch() {
      return []
    },
    async savePushSubscription(sub) {
      const existing = pushSubs.find((s) => s.repId === sub.repId)
      const ps: PushSubscription = {
        id: existing?.id ?? nextId('push'),
        organizationId: DEMO_ORG_ID,
    repId: sub.repId,
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
        createdAt: new Date().toISOString(),
      }
      if (existing) Object.assign(existing, ps)
      else pushSubs.push(ps)
      return ps
    },
    async getPushSubscription(repId: string) {
      return pushSubs.find((s) => s.repId === repId) ?? null
    },
    async deletePushSubscription(repId: string) {
      const idx = pushSubs.findIndex((s) => s.repId === repId)
      if (idx >= 0) pushSubs.splice(idx, 1)
    },
    async listNotifications() {
      return notifications.filter((n) => n.repId === rep.id && !n.read).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },
    async markNotificationRead(id: string) {
      const n = notifications.find((x) => x.id === id && x.repId === rep.id)
      if (n) n.read = true
    },
    // ── content engine ──
    async createContentPersona(input) {
      const persona: ContentPersona = {
        id: nextId('cp'),
        organizationId: 'org-demo',
        repId: input.repId,
        displayName: input.displayName,
        platforms: input.platforms,
        voiceProfileId: input.voiceProfileId ?? null,
        humorStyle: input.humorStyle ?? '',
        valuesAndOpinions: input.valuesAndOpinions ?? [],
        admiredExamples: input.admiredExamples ?? [],
        contentProfileId: null,
        createdAt: new Date().toISOString(),
      }
      contentPersonas.push(persona)
      return persona
    },
    async updateContentPersonaProfile(input) {
      const persona = contentPersonas.find((p) => p.id === input.personaId)
      if (!persona) throw new Error('Persona not found')
      if (typeof input.humorStyle === 'string') persona.humorStyle = input.humorStyle
      if (Array.isArray(input.valuesAndOpinions)) persona.valuesAndOpinions = input.valuesAndOpinions
      if (Array.isArray(input.admiredExamples)) persona.admiredExamples = input.admiredExamples
      return persona
    },
    async listContentPersonas(repId) {
      return contentPersonas
        .filter((p) => p.repId === repId)
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
    },
    async getContentPersona(personaId) {
      return contentPersonas.find((p) => p.id === personaId) ?? null
    },
    async deleteContentPersona(personaId) {
      const idx = contentPersonas.findIndex((p) => p.id === personaId)
      if (idx >= 0) contentPersonas.splice(idx, 1)
    },
    async createContentPillar(input) {
      const pillar: ContentPillar = {
        id: nextId('cpl'),
        organizationId: 'org-demo',
    personaId: input.personaId,
        pillarName: input.pillarName,
        description: input.description ?? '',
        createdAt: new Date().toISOString(),
      }
      contentPillars.push(pillar)
      return pillar
    },
    async listContentPillars(personaId) {
      return contentPillars
        .filter((p) => p.personaId === personaId)
        .sort((a, b) => a.pillarName.localeCompare(b.pillarName))
    },
    async deleteContentPillar(pillarId) {
      const idx = contentPillars.findIndex((p) => p.id === pillarId)
      if (idx >= 0) contentPillars.splice(idx, 1)
    },
    async createContentDraft(input) {
      const draft: ContentDraft = {
        id: nextId('cd'),
        organizationId: DEMO_ORG_ID,
        personaId: input.personaId,
        pillarId: input.pillarId,
        topicClusterId: input.topicClusterId ?? null,
        researchFindingId: input.researchFindingId ?? null,
        structureId: input.structureId ?? null,
        sourceKind: input.sourceKind ?? 'answer',
        sourceMaterial: input.sourceMaterial,
        platform: input.platform,
        caption: input.caption,
        hookScore: input.hookScore ?? null,
        hookFeedback: input.hookFeedback ?? '',
        selfCheckPassed: input.selfCheckPassed ?? false,
        selfCheckNote: input.selfCheckNote ?? '',
        specificityHit: input.specificityHit ?? false,
        status: input.status ?? 'draft',
        createdAt: new Date().toISOString(),
      }
      contentDrafts.push(draft)
      return draft
    },
    async listContentDrafts(personaId) {
      return contentDrafts
        .filter((d) => d.personaId === personaId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },
    async getContentDraft(draftId) {
      return contentDrafts.find((d) => d.id === draftId) ?? null
    },
    async updateContentDraftCaption(draftId, caption) {
      const draft = contentDrafts.find((d) => d.id === draftId)
      if (!draft) throw new Error('Draft not found')
      draft.caption = caption
      return draft
    },
    async updateContentDraftStatus(draftId, status) {
      const draft = contentDrafts.find((d) => d.id === draftId)
      if (!draft) throw new Error('Draft not found')
      draft.status = status
      if (status === 'posted' && draft.platform) {
        contentHistoryEntries.push({
          id: nextId('ch'),
          organizationId: 'org-demo',
    personaId: draft.personaId,
          pillarId: draft.pillarId,
          topicClusterId: draft.topicClusterId,
          platform: draft.platform,
          openingLine: draft.caption.split('\n')[0] ?? '',
          postedAt: new Date().toISOString(),
          ledToRealOutcome: false,
          outcomeNotedAt: null,
          likes: null,
          reach: null,
          comments: null,
          reposts: null,
          saves: null,
          profileVisits: null,
          followerDelta: null,
          metricsLoggedAt: null,
        })
      }
      return draft
    },
    async listContentHistory(personaId, limit = 20) {
      return contentHistoryEntries
        .filter((h) => h.personaId === personaId)
        .sort((a, b) => b.postedAt.localeCompare(a.postedAt))
        .slice(0, limit)
    },
    async logContentPosted(input) {
      const entry: ContentHistoryEntry = {
        id: nextId('ch'),
        organizationId: DEMO_ORG_ID,
        personaId: input.personaId,
        pillarId: input.pillarId,
        topicClusterId: input.topicClusterId ?? null,
        platform: input.platform,
        openingLine: input.openingLine,
        postedAt: new Date().toISOString(),
        ledToRealOutcome: false,
        outcomeNotedAt: null,
        likes: null,
        reach: null,
        comments: null,
        reposts: null,
        saves: null,
        profileVisits: null,
        followerDelta: null,
        metricsLoggedAt: null,
      }
      contentHistoryEntries.push(entry)
      return entry
    },
    async getContentHistoryEntry(historyId) {
      return contentHistoryEntries.find((h) => h.id === historyId) ?? null
    },
    async markContentHistoryOutcome(historyId, ledToRealOutcome) {
      const entry = contentHistoryEntries.find((h) => h.id === historyId)
      if (!entry) throw new Error('History entry not found')
      entry.ledToRealOutcome = ledToRealOutcome
      entry.outcomeNotedAt = ledToRealOutcome ? new Date().toISOString() : null
      return entry
    },
    async logContentMetrics(historyId, metrics) {
      const entry = contentHistoryEntries.find((h) => h.id === historyId)
      if (!entry) throw new Error('History entry not found')
      if ('likes' in metrics) entry.likes = metrics.likes ?? null
      if ('reach' in metrics) entry.reach = metrics.reach ?? null
      if ('comments' in metrics) entry.comments = metrics.comments ?? null
      if ('reposts' in metrics) entry.reposts = metrics.reposts ?? null
      if ('saves' in metrics) entry.saves = metrics.saves ?? null
      if ('profileVisits' in metrics) entry.profileVisits = metrics.profileVisits ?? null
      if ('followerDelta' in metrics) entry.followerDelta = metrics.followerDelta ?? null
      entry.metricsLoggedAt = new Date().toISOString()
      return entry
    },
    async listPostStructures() {
      return DEMO_POST_STRUCTURES
    },
    async createTrendingAngle(input) {
      const angle: TrendingAngle = {
        id: nextId('ta'),
        organizationId: DEMO_ORG_ID,
        pillarId: input.pillarId,
        topicClusterId: null,
        angleDescription: input.angleDescription,
        sourceNote: input.sourceNote ?? '',
        sourceUrl: '',
        addedBy: input.addedBy ?? null,
        addedAt: new Date().toISOString(),
        used: false,
      }
      trendingAngles.unshift(angle)
      return angle
    },
    async getTrendingAngle(angleId) {
      return trendingAngles.find((a) => a.id === angleId) ?? null
    },
    async listTrendingAnglesByPillarIds(pillarIds, opts) {
      return trendingAngles
        .filter((a) => pillarIds.includes(a.pillarId))
        .filter((a) => (opts?.unusedOnly ? !a.used : true))
        .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
    },
    async markTrendingAngleUsed(angleId) {
      const angle = trendingAngles.find((a) => a.id === angleId)
      if (!angle) throw new Error('Trending angle not found')
      angle.used = true
      return angle
    },
    async countContentDraftsToday(personaId) {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      const end = new Date()
      end.setHours(23, 59, 59, 999)
      return contentDrafts
        .filter((d) => d.personaId === personaId)
        .filter((d) => {
          const created = new Date(d.createdAt).getTime()
          return created >= start.getTime() && created <= end.getTime()
        })
        .length
    },
    async createTopicCluster(input) {
      const now = new Date().toISOString()
      const row: TopicCluster = {
        id: nextId('tc'),
        organizationId: DEMO_ORG_ID,
        personaId: input.personaId,
        clusterName: input.clusterName,
        description: input.description ?? '',
        sourceType: input.sourceType ?? 'system',
        mergedIntoId: null,
        lastInputAt: input.lastInputAt ?? null,
        lastResearchAt: input.lastResearchAt ?? null,
        createdAt: now,
        updatedAt: now,
      }
      topicClusters.unshift(row)
      return row
    },
    async listTopicClusters(personaId) {
      return topicClusters
        .filter((c) => c.personaId === personaId && !c.mergedIntoId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    },
    async touchTopicCluster(input) {
      const row = topicClusters.find((c) => c.id === input.topicClusterId)
      if (!row) throw new Error('Topic cluster not found')
      if (input.lastInputAt !== undefined) row.lastInputAt = input.lastInputAt
      if (input.lastResearchAt !== undefined) row.lastResearchAt = input.lastResearchAt
      row.updatedAt = new Date().toISOString()
      return row
    },
    async createResearchFinding(input) {
      const finding: ContentResearchFinding = {
        id: nextId('rf'),
        organizationId: DEMO_ORG_ID,
        personaId: input.personaId,
        topicClusterId: input.topicClusterId,
        finding: input.finding,
        sourceLabel: input.sourceLabel,
        sourceUrl: input.sourceUrl,
        sourcePublishedAt: input.sourcePublishedAt ?? null,
        used: false,
        createdAt: new Date().toISOString(),
      }
      researchFindings.unshift(finding)
      return finding
    },
    async listResearchFindings(personaId, opts) {
      return researchFindings
        .filter((f) => f.personaId === personaId)
        .filter((f) => (opts?.unusedOnly ? !f.used : true))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, opts?.limit ?? researchFindings.length)
    },
    async markResearchFindingUsed(findingId) {
      const finding = researchFindings.find((f) => f.id === findingId)
      if (!finding) throw new Error('Finding not found')
      finding.used = true
      return finding
    },
    async createContentDraftFeedback(input) {
      const row: ContentDraftFeedback = {
        id: nextId('cdf'),
        organizationId: DEMO_ORG_ID,
        personaId: input.personaId,
        draftId: input.draftId,
        topicClusterId: input.topicClusterId,
        sourceKind: input.sourceKind,
        reaction: input.reaction,
        edited: input.edited,
        editSignals: input.editSignals,
        createdAt: new Date().toISOString(),
      }
      contentDraftFeedback.unshift(row)
      return row
    },
    async listContentDraftFeedback(personaId, limit = 60) {
      return contentDraftFeedback
        .filter((f) => f.personaId === personaId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit)
    },
    // ── content profiles (Content DNA) ──
    async createContentProfile(input) {
      const now = new Date().toISOString()
      const profile: ContentProfile = {
        id: nextId('cdp'),
        organizationId: DEMO_ORG_ID,
        personaId: input.personaId,
        role: input.role ?? '',
        seniority: input.seniority ?? '',
        industries: input.industries ?? [],
        audience: input.audience ?? '',
        expertise: [],
        technologies: [],
        goals: [],
        topicsCared: [],
        topicsAvoided: [],
        opinions: [],
        projects: [],
        experiences: [],
        writingCharacteristics: {},
        storytellingTendencies: [],
        confidence: 0,
        lastLearnedAt: null,
        createdAt: now,
        updatedAt: now,
      }
      contentProfiles.push(profile)
      const persona = contentPersonas.find((p) => p.id === input.personaId)
      if (persona) persona.contentProfileId = profile.id
      return profile
    },
    async getContentProfile(profileId) {
      return contentProfiles.find((p) => p.id === profileId) ?? null
    },
    async getContentProfileByPersona(personaId) {
      return contentProfiles.find((p) => p.personaId === personaId) ?? null
    },
    async updateContentProfile(profileId, patches) {
      const profile = contentProfiles.find((p) => p.id === profileId)
      if (!profile) throw new Error('Content profile not found')
      if (patches.role !== undefined) profile.role = patches.role
      if (patches.seniority !== undefined) profile.seniority = patches.seniority
      if (patches.industries !== undefined) profile.industries = patches.industries
      if (patches.audience !== undefined) profile.audience = patches.audience
      if (patches.expertise !== undefined) profile.expertise = patches.expertise
      if (patches.technologies !== undefined) profile.technologies = patches.technologies
      if (patches.goals !== undefined) profile.goals = patches.goals
      if (patches.topicsCared !== undefined) profile.topicsCared = patches.topicsCared
      if (patches.topicsAvoided !== undefined) profile.topicsAvoided = patches.topicsAvoided
      if (patches.opinions !== undefined) profile.opinions = patches.opinions
      if (patches.projects !== undefined) profile.projects = patches.projects
      if (patches.experiences !== undefined) profile.experiences = patches.experiences
      if (patches.writingCharacteristics !== undefined) profile.writingCharacteristics = patches.writingCharacteristics
      if (patches.storytellingTendencies !== undefined) profile.storytellingTendencies = patches.storytellingTendencies
      if (patches.confidence !== undefined) profile.confidence = patches.confidence
      profile.updatedAt = new Date().toISOString()
      profile.lastLearnedAt = new Date().toISOString()
      return profile
    },
    async deleteContentProfile(profileId) {
      const idx = contentProfiles.findIndex((p) => p.id === profileId)
      if (idx >= 0) contentProfiles.splice(idx, 1)
    },
    // ── content memories ──
    async createContentMemory(input) {
      const row: ContentMemory = {
        id: nextId('cm'),
        organizationId: DEMO_ORG_ID,
        personaId: input.personaId,
        memoryType: input.memoryType,
        content: input.content,
        sourceDraftId: input.sourceDraftId ?? null,
        sourceHistoryId: input.sourceHistoryId ?? null,
        createdAt: new Date().toISOString(),
      }
      contentMemories.unshift(row)
      return row
    },
    async listContentMemories(personaId, opts) {
      return contentMemories
        .filter((m) => m.personaId === personaId)
        .filter((m) => (opts?.memoryType ? m.memoryType === opts.memoryType : true))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, opts?.limit ?? contentMemories.length)
    },
    async deleteContentMemory(memoryId) {
      const idx = contentMemories.findIndex((m) => m.id === memoryId)
      if (idx >= 0) contentMemories.splice(idx, 1)
    },
    // ── content opportunities ──
    async createContentOpportunity(input) {
      const row: ContentOpportunity = {
        id: nextId('co'),
        organizationId: DEMO_ORG_ID,
        personaId: input.personaId,
        opportunityType: input.opportunityType,
        title: input.title,
        description: input.description,
        trigger: input.trigger,
        qualification: {},
        qualified: false,
        sourceKind: input.sourceKind ?? null,
        sourceReference: input.sourceReference ?? null,
        status: 'pending',
        createdAt: new Date().toISOString(),
        dismissedAt: null,
        completedAt: null,
      }
      contentOpportunities.unshift(row)
      return row
    },
    async listContentOpportunities(personaId, opts) {
      return contentOpportunities
        .filter((o) => o.personaId === personaId)
        .filter((o) => (opts?.status ? o.status === opts.status : true))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, opts?.limit ?? contentOpportunities.length)
    },
    async getContentOpportunity(opportunityId) {
      return contentOpportunities.find((o) => o.id === opportunityId) ?? null
    },
    async updateContentOpportunity(opportunityId, patches) {
      const opp = contentOpportunities.find((o) => o.id === opportunityId)
      if (!opp) throw new Error('Opportunity not found')
      if (patches.qualification !== undefined) opp.qualification = patches.qualification
      if (patches.qualified !== undefined) opp.qualified = patches.qualified
      if (patches.status !== undefined) opp.status = patches.status as ContentOpportunity['status']
      if (patches.dismissedAt !== undefined) opp.dismissedAt = patches.dismissedAt
      if (patches.completedAt !== undefined) opp.completedAt = patches.completedAt
      return opp
    },
    async deleteContentOpportunity(opportunityId) {
      const idx = contentOpportunities.findIndex((o) => o.id === opportunityId)
      if (idx >= 0) contentOpportunities.splice(idx, 1)
    },
    // ── idea genomes ──
    async createIdeaGenome(input) {
      const now = new Date().toISOString()
      const row: ContentIdeaGenome = {
        id: nextId('cig'),
        organizationId: DEMO_ORG_ID,
        personaId: input.personaId,
        source: input.source,
        topic: input.topic,
        angle: input.angle,
        archetype: input.archetype,
        audience: input.audience,
        emotion: input.emotion ?? null,
        value_type: input.valueType ?? null,
        novelty: 0,
        evidenceStrength: 0,
        personalSpecificity: 0,
        relevance: 0,
        conversationPotential: 0,
        contentMemoryOverlap: [],
        differentiationNote: '',
        status: 'candidate',
        rejectionReason: null,
        opportunityId: input.opportunityId ?? null,
        draftId: null,
        createdAt: now,
        updatedAt: now,
      }
      contentIdeaGenomes.unshift(row)
      return row
    },
    async getIdeaGenome(genomeId) {
      return contentIdeaGenomes.find((g) => g.id === genomeId) ?? null
    },
    async updateIdeaGenome(genomeId, patches) {
      const genome = contentIdeaGenomes.find((g) => g.id === genomeId)
      if (!genome) throw new Error('Genome not found')
      if (patches.novelty !== undefined) genome.novelty = patches.novelty
      if (patches.evidenceStrength !== undefined) genome.evidenceStrength = patches.evidenceStrength
      if (patches.personalSpecificity !== undefined) genome.personalSpecificity = patches.personalSpecificity
      if (patches.relevance !== undefined) genome.relevance = patches.relevance
      if (patches.conversationPotential !== undefined) genome.conversationPotential = patches.conversationPotential
      if (patches.contentMemoryOverlap !== undefined) genome.contentMemoryOverlap = patches.contentMemoryOverlap
      if (patches.differentiationNote !== undefined) genome.differentiationNote = patches.differentiationNote
      if (patches.status !== undefined) genome.status = patches.status as ContentIdeaGenome['status']
      if (patches.rejectionReason !== undefined) genome.rejectionReason = patches.rejectionReason
      if (patches.draftId !== undefined) genome.draftId = patches.draftId
      genome.updatedAt = new Date().toISOString()
      return genome
    },
    // ── evaluations ──
    async createEvaluation(input) {
      const row: ContentEvaluation = {
        id: nextId('ce'),
        draftId: input.draftId,
        originality: input.originality ?? 0,
        personalSpecificity: input.personalSpecificity ?? 0,
        usefulness: input.usefulness ?? 0,
        credibility: input.credibility ?? 0,
        evidence: input.evidence ?? 0,
        clarity: input.clarity ?? 0,
        storytelling: input.storytelling ?? 0,
        voiceMatch: input.voiceMatch ?? 0,
        stopPotential: input.stopPotential ?? 0,
        dwellPotential: input.dwellPotential ?? 0,
        commentPotential: input.commentPotential ?? 0,
        savePotential: input.savePotential ?? 0,
        sharePotential: input.sharePotential ?? 0,
        audienceRelevance: input.audienceRelevance ?? 0,
        slopScore: input.slopScore ?? 0,
        genericProbability: input.genericProbability ?? 0,
        qualityNotes: input.qualityNotes ?? {},
        distributionNotes: input.distributionNotes ?? {},
        createdAt: new Date().toISOString(),
      }
      contentEvaluations.unshift(row)
      return row
    },
    async getEvaluation(evaluationId) {
      return contentEvaluations.find((e) => e.id === evaluationId) ?? null
    },
    // ── interview sessions ──
    async createInterviewSession(input) {
      const row: ContentInterviewSession = {
        id: nextId('cis'),
        organizationId: DEMO_ORG_ID,
        personaId: input.personaId,
        opportunityId: input.opportunityId ?? null,
        sessionType: input.sessionType,
        status: 'active',
        questionsAsked: 0,
        informationGain: 0,
        createdAt: new Date().toISOString(),
        completedAt: null,
      }
      interviewSessions.unshift(row)
      return row
    },
    async getInterviewSession(sessionId) {
      return interviewSessions.find((s) => s.id === sessionId) ?? null
    },
    async listInterviewSessions(personaId, opts) {
      return interviewSessions
        .filter((s) => s.personaId === personaId)
        .filter((s) => (opts?.status ? s.status === opts.status : true))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, opts?.limit ?? interviewSessions.length)
    },
    async updateInterviewSession(sessionId, patches) {
      const session = interviewSessions.find((s) => s.id === sessionId)
      if (!session) throw new Error('Session not found')
      if (patches.status !== undefined) session.status = patches.status as ContentInterviewSession['status']
      if (patches.questionsAsked !== undefined) session.questionsAsked = patches.questionsAsked
      if (patches.informationGain !== undefined) session.informationGain = patches.informationGain
      if (patches.completedAt !== undefined) session.completedAt = patches.completedAt
      return session
    },
    async createInterviewAnswer(input) {
      const row: ContentInterviewAnswer = {
        id: nextId('cia'),
        sessionId: input.sessionId,
        question: input.question,
        answer: input.answer,
        informationGain: input.informationGain ?? 0,
        createdAt: new Date().toISOString(),
      }
      interviewAnswers.push(row)
      return row
    },
    async listInterviewAnswers(sessionId) {
      return interviewAnswers
        .filter((a) => a.sessionId === sessionId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    },
  }
}
