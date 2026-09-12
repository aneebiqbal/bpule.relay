import type {
  CsvImport,
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
  UpworkJob,
  UpworkMessage,
  Verdict,
  VoiceProfile,
} from '@/lib/domain/types'
import type {
  CreateLeadResult,
  DosageResult,
  NewLeadInput,
  QueueData,
  SaveDraftInput,
  ScoutStore,
  StoreContext,
  TeamStats,
  TodayDashboard,
} from '@/lib/store/types'
import { companyFuzzyKey, companyKey } from '@/lib/leads/normalize'
import { dailySendLimit, messageTypeLimit } from '@/lib/ai/config'
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

const t = (daysAgo: number, hour = 10) => {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

export function buildMockStore(ctx: StoreContext): ScoutStore {
  const rep = ctx.rep

  const reps: Rep[] = [
    { id: 'rep-hassan', name: 'Hassan (demo)', role: 'admin', createdAt: t(60) },
    { id: 'rep-ahmed', name: 'Ahmed (demo)', role: 'rep', createdAt: t(50) },
    { id: 'rep-nadia', name: 'Nadia (demo)', role: 'rep', createdAt: t(40) },
    { id: 'rep-samir', name: 'Samir (demo)', role: 'sourcer', createdAt: t(12) },
  ]

  const voiceProfiles: VoiceProfile[] = [
    {
      id: 'vp-ahmed',
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
    { id: 'out-acme-read', leadId: 'lead-acme', stage: 'read', occurredAt: t(5) },
    { id: 'out-acme-check', leadId: 'lead-acme', stage: 'check', occurredAt: t(4) },
    { id: 'out-acme-replied', leadId: 'lead-acme', stage: 'replied', occurredAt: t(4) },
    { id: 'out-cedar-read', leadId: 'lead-cedar', stage: 'read', occurredAt: t(3) },
    { id: 'out-everest-replied', leadId: 'lead-everest', stage: 'replied', occurredAt: t(7) },
  ]

  const facts: Fact[] = [
    { id: 'fact-years', label: 'Years shipping (FAKE)', value: '8 years', factType: 'credential', addedBy: 'rep-hassan', createdAt: t(30) },
    { id: 'fact-price', label: 'Typical senior project (FAKE)', value: '$14k per month', factType: 'price', addedBy: 'rep-hassan', createdAt: t(30) },
    { id: 'fact-reboot', label: 'Reliable rewrites (FAKE)', value: 'ship a reboot without a rewrite', factType: 'credential', addedBy: 'rep-hassan', createdAt: t(30) },
    { id: 'fact-cases', label: 'AI products shipped (FAKE)', value: '40+ products', factType: 'case', addedBy: 'rep-hassan', createdAt: t(30) },
    { id: 'fact-process', label: 'Review pace (FAKE)', value: 'first plan in 10 days', factType: 'process', addedBy: 'rep-hassan', createdAt: t(30) },
  ]

  const plays: Play[] = [
    {
      id: 'play-rescue',
      name: 'Play: rescue the backlog (FAKE)',
      situation: 'asking',
      templateShape: 'Addresses the specific bottleneck they mentioned, offers one concrete next step, keeps it to 3 sentences.',
    },
    {
      id: 'play-hiring',
      name: 'Play: hiring ramp (FAKE)',
      situation: 'hiring',
      templateShape: 'Notices the hiring signal, names the capacity gap, asks if a delivery partner would let them keep hiring on the roadmap.',
    },
    {
      id: 'play-price',
      name: 'Play: budget anchor (FAKE)',
      situation: 'funding',
      templateShape: 'Congratulates briefly, then gives a clear, budget-relevant fact and a low-friction next step.',
    },
  ]

  const profiles: Profile[] = [
    {
      id: 'profile-hassan-linkedin',
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

  const upworkJobs: UpworkJob[] = []
  const upworkMessages: UpworkMessage[] = []
  const pushSubs: PushSubscription[] = []
  const notifications: NotificationLogEntry[] = []
  const csvImports: CsvImport[] = []

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

  return {
    async createLead(input: NewLeadInput): Promise<CreateLeadResult> {
      const blocked = dedupe(input.company)
      if (blocked) return blocked
      const lead: Lead = {
        id: nextId('lead'),
        ownerRepId: rep.id,
        company: input.company.trim(),
        companyKey: companyKey(input.company),
        contactName: input.contactName?.trim() || null,
        contactTitle: input.contactTitle?.trim() || null,
        url: input.url?.trim() || null,
        rawInput: input.rawInput?.trim() || null,
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
      const myProofs = proofItems.filter((x) =>
        profiles.some((p) => p.id === x.profileId && p.repId === rep.id),
      )
      return matchProofItemsByTags(myProofs, tags, limit)
    },
    async getTodayDashboard(): Promise<TodayDashboard> {
      const mine = await this.getQueue()
      const team = computeRates(leads.map((lead) => ({
        lead,
        sentMessages: messages.filter((m) => m.leadId === lead.id),
        outcomes: outcomes.filter((o) => o.leadId === lead.id),
      })))
      return { mine: { ...mine, queue: mine.queue, replies: mine.replies }, team }
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
  }
}