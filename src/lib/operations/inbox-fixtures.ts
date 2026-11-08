/**
 * Realistic synthetic Inbox fixtures for deterministic visual QA.
 *
 * Neon Auth may be unavailable, so the Inbox is developed and screenshot-
 * reviewed against these fixtures instead of a live session. They exercise
 * every queue view and every waiting state with realistic people, companies,
 * message previews and canonical intent — no lorem ipsum.
 */
import type { ChatRow } from '@/lib/operations/chat-queue'
import type { ChatIntelligence, SalesThesisView } from '@/lib/operations/chat-intelligence'
import type { TimelineRow } from '@/lib/operations/activity'

const NOW = Date.parse('2026-11-03T09:00:00.000Z')
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString()
const MINS = 60_000

interface Seed {
  id: string
  person: string
  title: string | null
  company: string | null
  companyKey: string | null
  ownerName: string | null
  profileName: string | null
  state: ChatRow['state']
  ageHours: number | null
  lastInboundAt: string | null
  lastOutboundAt: string | null
  preview: string
  previewFrom: 'client' | 'me'
  intent: string | null
  priority: ChatRow['priority']
  nextAction: string
}

/** Eleven realistic conversations covering every queue view. */
const SEEDS: Seed[] = [
  {
    id: 'lead-pricing-5h',
    person: 'Sarah Chen',
    title: 'VP Engineering',
    company: 'Acme',
    companyKey: 'acme',
    ownerName: 'Mehak',
    profileName: 'Mehak LinkedIn',
    state: 'waiting_on_rep',
    ageHours: 5,
    lastInboundAt: hoursAgo(5),
    lastOutboundAt: hoursAgo(26),
    preview: 'Can you send pricing for the MVP? We want to start in January with two seats.',
    previewFrom: 'client',
    intent: 'pricing',
    priority: 'high',
    nextAction: 'Reply',
  },
  {
    id: 'lead-13h-neglect',
    person: 'Marcus Webb',
    title: 'Head of Operations',
    company: 'Northwind Logistics',
    companyKey: 'northwind-logistics',
    ownerName: 'Mehak',
    profileName: 'Mehak LinkedIn',
    state: 'waiting_on_rep',
    ageHours: 13,
    lastInboundAt: hoursAgo(13),
    lastOutboundAt: hoursAgo(40),
    preview: 'Following up on my last note — the team lead asked me to confirm the rollout timeline.',
    previewFrom: 'client',
    intent: null,
    priority: 'critical',
    nextAction: 'Reply',
  },
  {
    id: 'lead-meeting-request',
    person: 'Priya Raman',
    title: 'CTO',
    company: 'Lumen Health',
    companyKey: 'lumen-health',
    ownerName: 'Mehak',
    profileName: 'Mehak LinkedIn',
    state: 'waiting_on_rep',
    ageHours: 2,
    lastInboundAt: hoursAgo(2),
    lastOutboundAt: hoursAgo(20),
    preview: 'A 20-minute call this week would help. Does Thursday 10:30 work for you?',
    previewFrom: 'client',
    intent: 'meeting_request',
    priority: 'high',
    nextAction: 'Reply',
  },
  {
    id: 'lead-followup-due',
    person: 'Diego Alvarez',
    title: 'Founder',
    company: 'Framely',
    companyKey: 'framely',
    ownerName: 'Mehak',
    profileName: 'Mehak LinkedIn',
    state: 'follow_up_due',
    ageHours: 3,
    lastInboundAt: null,
    lastOutboundAt: hoursAgo(3),
    preview: 'Thanks for the intro — happy to share the deck with the team.',
    previewFrom: 'me',
    intent: null,
    priority: 'normal',
    nextAction: 'Send follow-up',
  },
  {
    id: 'lead-waiting-client',
    person: 'Hana Kobayashi',
    title: 'Product Lead',
    company: 'Studio Nori',
    companyKey: 'studio-nori',
    ownerName: 'Mehak',
    profileName: 'Mehak LinkedIn',
    state: 'waiting_on_prospect',
    ageHours: 9,
    lastInboundAt: hoursAgo(30),
    lastOutboundAt: hoursAgo(9),
    preview: 'That makes sense. I will review the case studies and come back to you.',
    previewFrom: 'me',
    intent: null,
    priority: 'low',
    nextAction: 'Wait for reply',
  },
  {
    id: 'lead-proposal-request',
    person: 'Tom Okafor',
    title: 'COO',
    company: 'Bright Freight',
    companyKey: 'bright-freight',
    ownerName: 'Mehak',
    profileName: 'Mehak LinkedIn',
    state: 'waiting_on_rep',
    ageHours: 1,
    lastInboundAt: hoursAgo(1),
    lastOutboundAt: hoursAgo(18),
    preview: 'Could you put together a proposal for the 40-seat rollout? Budget is approved.',
    previewFrom: 'client',
    intent: 'pricing',
    priority: 'high',
    nextAction: 'Reply',
  },
  {
    id: 'lead-inbound-first',
    person: 'Aisha Bello',
    title: 'Engineering Manager',
    company: 'Kite Pay',
    companyKey: 'kite-pay',
    ownerName: 'Mehak',
    profileName: 'Mehak LinkedIn',
    state: 'waiting_on_rep',
    ageHours: 0.7,
    lastInboundAt: new Date(NOW - 42 * MINS).toISOString(),
    lastOutboundAt: null,
    preview: 'Hi — found your profile through the platform. We need help with outbound and want to talk.',
    previewFrom: 'client',
    intent: null,
    priority: 'normal',
    nextAction: 'Reply',
  },
  {
    id: 'lead-unassigned',
    person: 'Lena Fischer',
    title: 'Head of Growth',
    company: 'Loopwork',
    companyKey: 'loopwork',
    ownerName: null,
    profileName: null,
    state: 'waiting_on_rep',
    ageHours: 7,
    lastInboundAt: hoursAgo(7),
    lastOutboundAt: hoursAgo(28),
    preview: 'Is anyone available to help us set this up? The trial ends on Friday.',
    previewFrom: 'client',
    intent: null,
    priority: 'high',
    nextAction: 'Reply',
  },
  {
    id: 'lead-meeting-stage',
    person: 'Omar Haddad',
    title: 'VP Sales',
    company: 'Meridian',
    companyKey: 'meridian',
    ownerName: 'Mehak',
    profileName: 'Mehak LinkedIn',
    state: 'meeting',
    ageHours: 4,
    lastInboundAt: hoursAgo(10),
    lastOutboundAt: hoursAgo(4),
    preview: 'Confirmed for Tuesday 14:00. I will send the agenda shortly.',
    previewFrom: 'client',
    intent: 'meeting_request',
    priority: 'normal',
    nextAction: 'Prepare for meeting',
  },
  {
    id: 'lead-closed-won',
    person: 'Grace Lin',
    title: 'Director of Revenue',
    company: 'Atlas Retail',
    companyKey: 'atlas-retail',
    ownerName: 'Mehak',
    profileName: 'Mehak LinkedIn',
    state: 'closed',
    ageHours: null,
    lastInboundAt: hoursAgo(120),
    lastOutboundAt: hoursAgo(96),
    preview: 'Signed and returned. Finance will process the first invoice this week.',
    previewFrom: 'client',
    intent: null,
    priority: 'low',
    nextAction: 'None',
  },
  {
    id: 'lead-fresh-reply',
    person: 'Ben Carter',
    title: 'CEO',
    company: 'Northbeam Labs',
    companyKey: 'northbeam-labs',
    ownerName: 'Mehak',
    profileName: 'Mehak LinkedIn',
    state: 'waiting_on_rep',
    ageHours: 0.05,
    lastInboundAt: new Date(NOW - 3 * MINS).toISOString(),
    lastOutboundAt: hoursAgo(14),
    preview: 'Yes — send it over. I have 15 minutes on Friday morning.',
    previewFrom: 'client',
    intent: null,
    priority: 'normal',
    nextAction: 'Reply',
  },
]

export const INBOX_FIXTURE_ROWS: ChatRow[] = SEEDS.map((s) => ({
  leadId: s.id,
  person: s.person,
  company: s.company,
  companyKey: s.companyKey,
  ownerRepId: s.ownerName ? `rep-${s.ownerName.toLowerCase().replace(/\s+/g, '-')}` : null,
  ownerName: s.ownerName,
  profileName: s.profileName,
  state: s.state,
  stageLabel: s.state === 'meeting' ? 'meeting' : 'conversation',
  lastInboundAt: s.lastInboundAt,
  lastOutboundAt: s.lastOutboundAt,
  waitingOn: s.state === 'closed' ? null : s.state === 'waiting_on_rep' ? 'Rep' : 'Prospect',
  ageHours: s.ageHours,
  nextAction: s.nextAction,
  href: `/chats?lead=${s.id}`,
  title: s.title,
  source: 'linkedin',
  sourceRaw: 'linkedin',
  direction: 'outbound',
  profileId: s.profileName ? `profile-${s.profileName.toLowerCase().replace(/\s+/g, '-')}` : null,
  clientIntent: s.intent,
  preview: s.preview,
  previewFrom: s.previewFrom,
  needsReview: s.id === 'lead-13h-neglect',
  unassigned: !s.ownerName,
  priority: s.priority,
}))

export const INBOX_FIXTURE_SELECTED_ID = 'lead-pricing-5h'

const THESIS: SalesThesisView = {
  whyThisAccount: 'Acme is hiring across the revenue team and has a stated budget for outbound tooling.',
  likelyOpportunity: 'Pilot with two seats, expanding to the full engineering org in Q1.',
  whyThisSender: 'Mehak has shipped outbound tooling at the same stage and speaks the buyer’s language.',
  bestEntryPoint: 'Reference the January start and ask who else is in the evaluation.',
  missingEvidence: ['No confirmed budget owner', 'No current vendor contract date'],
  risks: ['Evaluation could slip past January', 'Two seats may be a pilot that never expands'],
  confidence: 'MEDIUM',
}

const FIXTURE_CREATED = hoursAgo(30)

export const INBOX_FIXTURE_CREATED_AT = FIXTURE_CREATED

/** Canonical action events for the fixture, derived from the row's own timestamps. */
function inboxFixtureHistory(row: ChatRow): TimelineRow[] {
  const base = {
    actorRepId: row.ownerRepId,
    actorName: row.ownerName,
    profileName: row.profileName,
    leadId: row.leadId,
    leadLabel: row.person,
    company: row.company,
    companyKey: row.companyKey,
    href: row.href,
    source: 'linkedin' as const,
  }
  const events: TimelineRow[] = [
    { ...base, id: 'h-created', at: FIXTURE_CREATED, event: 'Lead created', category: 'pipeline', result: null },
  ]
  if (row.lastOutboundAt) {
    events.push({ ...base, id: 'h-out', at: row.lastOutboundAt, event: 'Connection sent', category: 'outreach', result: 'LinkedIn' })
  }
  if (row.lastInboundAt) {
    events.push({ ...base, id: 'h-in', at: row.lastInboundAt, event: 'Inbound received', category: 'conversation', result: 'LinkedIn' })
  }
  return events.sort((a, b) => b.at.localeCompare(a.at))
}

export function inboxFixtureIntelligence(leadId: string): ChatIntelligence {
  const row = INBOX_FIXTURE_ROWS.find((r) => r.leadId === leadId) ?? INBOX_FIXTURE_ROWS[0]
  return {
    leadId: row.leadId,
    person: row.person,
    title: row.title,
    company: row.company,
    companyKey: row.companyKey,
    url: 'https://www.linkedin.com/in/example',
    ownerRepId: row.ownerRepId,
    ownerName: row.ownerName,
    profileId: row.profileId,
    profileName: row.profileName,
    sourceRaw: row.sourceRaw,
    direction: row.direction,
    leadCreatedAt: FIXTURE_CREATED,
    noteCount: 2,
    history: inboxFixtureHistory(row),
    score: 82,
    qualification: 'WORTH_PURSUING',
    buyerIntent: 'HIGH',
    stage: 'conversation',
    status: 'replied',
    conversation: {
      leadId: row.leadId,
      person: row.person,
      company: row.company,
      companyKey: row.companyKey,
      ownerRepId: row.ownerRepId,
      ownerName: row.ownerName,
      profileName: row.profileName,
      state: row.state,
      stageLabel: row.stageLabel,
      lastInboundAt: row.lastInboundAt,
      lastOutboundAt: row.lastOutboundAt,
      waitingOn: row.waitingOn,
      ageHours: row.ageHours,
      nextAction: row.nextAction,
      href: row.href,
    },
    thesis: THESIS,
    facts: {
      need: 'A reliable outbound motion for a team hiring through January.',
      timeline: 'Wants to start in January; evaluation this month.',
      budget: 'Approved for a two-seat pilot.',
      decisionMaker: 'Sarah is the evaluator; the VP of Engineering signs off.',
      nextStepNotes: 'Send pricing and ask who else is in the evaluation.',
      openQuestions: ['Who else is evaluating?', 'What does success look like in 90 days?'],
      objections: ['Currently using a spreadsheet and a part-time SDR.'],
      buyingSignals: ['Asked for pricing', 'Named a start date', 'Mentioned headcount'],
    },
    lastClientIntent: row.clientIntent,
    openTasks: [
      { id: 'task-1', title: 'Send the MVP pricing one-pager', priority: 'HIGH', dueAt: null, status: 'OPEN', assigneeName: 'Mehak' },
      { id: 'task-2', title: 'Confirm the January onboarding date', priority: 'NORMAL', dueAt: null, status: 'OPEN', assigneeName: 'Dawood' },
    ],
  }
}

export const INBOX_FIXTURE_MESSAGES = [
  {
    id: 'm1',
    direction: 'outbound' as const,
    kind: 'Connection',
    body: 'Hi Sarah — congrats on the Series B. We help revenue teams at your stage run a reliable outbound motion without hiring a full SDR team.',
    at: hoursAgo(26),
    sender: 'Mehak',
  },
  {
    id: 'm2',
    direction: 'inbound' as const,
    kind: 'Reply',
    body: 'Thanks — we are actually looking at this now. What does it cost for a small team?',
    at: hoursAgo(25),
    sender: 'Sarah Chen',
  },
  {
    id: 'm3',
    direction: 'outbound' as const,
    kind: 'Follow-up',
    body: 'Happy to share. For two seats it is $1,800/mo with onboarding included. Want me to send the one-pager?',
    at: hoursAgo(24),
    sender: 'Mehak',
  },
  {
    id: 'm4',
    direction: 'inbound' as const,
    kind: 'Reply',
    body: 'Can you send pricing for the MVP? We want to start in January with two seats.',
    at: hoursAgo(5),
    sender: 'Sarah Chen',
  },
]

export const INBOX_FIXTURE_VIEW_LABELS = ['Needs reply', 'Waiting', 'Follow-ups', 'Meeting requests', 'Proposal requests', 'Closed']
