import { notFound } from 'next/navigation'
import { V4ManagerHome } from '@/components/v4/v4-manager-home'
import type { RepWorkspaceData } from '@/lib/rep-home/rep-workspace-data'
import type { RelayTodayAction } from '@/lib/tasks/relay-today-action'
import type { ManagerHomeTeamData } from '@/lib/team/manager-home-summary'
import type { AttentionSignal } from '@/lib/team/attention-policy'

export const dynamic = 'force-dynamic'

/**
 * Deterministic V4 QA fixture — Manager Home.
 *
 * The live workspace has no manager-role rep, so Manager Home cannot be
 * reached with real credentials. This route renders it with fixed, realistic
 * fixture data (no database reads, no writes) so the surface can be visually
 * certified. It is unlinked from navigation and gated by QA_FIXTURE=1.
 *
 * The numbers are illustrative only and never enter the product's metrics.
 */

const personal: RepWorkspaceData = {
  rep: { id: 'fixture-manager', name: 'Sarah Mitchell' },
  activeWorkspace: {
    id: 'fixture-identity',
    identityName: 'Sarah Mitchell',
    title: 'Head of Revenue',
    channel: 'linkedin',
  },
  isWorkingDay: true,
  hasAssignments: true,
  identities: [],
  targetSummary: {
    totalTarget: 20,
    totalCompleted: 8,
    totalRemaining: 12,
    overallStatus: 'on_track',
    byIdentity: [],
  },
  day: {
    totalRemaining: 12,
    repliesWaiting: 2,
    waitingOnClient: 0,
    followUpsDue: 1,
    outreachRemaining: 9,
    isComplete: false,
  },
  nextAction: null,
  upNext: [],
  allActions: [
    {
      id: 'a1',
      kind: 'reply_needed',
      priority: 'urgent',
      title: 'Reply to Daniel Okafor',
      subtitle: 'Acme Logistics · asked for a proposal',
      href: '/leads/fixture-1',
      whatHappened: 'Client replied — your turn',
      whyItMatters: 'Client replied — your turn',
      whyLines: ['Client replied — your turn'],
      prepared: null,
      humanAction: 'REPLY_NOW',
      createdAt: new Date(Date.now() - 42 * 60_000).toISOString(),
      fitScore: 82,
      identity: { id: 'fixture-identity', name: 'Sarah Mitchell', title: 'Head of Revenue', channel: 'linkedin' },
      proof: null,
      inbound: true,
    },
    {
      id: 'a2',
      kind: 'followup_due',
      priority: 'high',
      title: 'Follow up with Priya Nair',
      subtitle: 'Northwind Retail · proposal sent 4 days ago',
      href: '/leads/fixture-2',
      whatHappened: 'Follow-up due — no reply yet',
      whyItMatters: 'Follow-up due — no reply yet',
      whyLines: ['Follow-up due — no reply yet'],
      prepared: null,
      humanAction: 'SEND_FOLLOWUP',
      createdAt: new Date(Date.now() - 4 * 24 * 3_600_000).toISOString(),
      fitScore: 74,
      identity: { id: 'fixture-identity', name: 'Sarah Mitchell', title: 'Head of Revenue', channel: 'linkedin' },
      proof: null,
      inbound: false,
    },
    {
      id: 'a3',
      kind: 'high_fit_lead',
      priority: 'medium',
      title: 'Review Orbit Analytics',
      subtitle: 'Orbit Analytics · strong fit, not yet contacted',
      href: '/leads/fixture-3',
      whatHappened: 'Strong canonical fit — worth a look',
      whyItMatters: 'Strong canonical fit — worth a look',
      whyLines: ['Strong canonical fit — worth a look'],
      prepared: null,
      humanAction: 'RESEARCH',
      createdAt: new Date(Date.now() - 6 * 3_600_000).toISOString(),
      fitScore: 88,
      identity: { id: 'fixture-identity', name: 'Sarah Mitchell', title: 'Head of Revenue', channel: 'linkedin' },
      proof: null,
      inbound: false,
    },
  ] as RelayTodayAction[],
  unifiedTasks: [],
  notifications: [],
}

const attention: AttentionSignal[] = [
  {
    category: 'REPLIES_WAITING',
    repId: 'fixture-rep-1',
    repName: 'Ayesha Khan',
    count: 6,
    reason: '6 replies waiting · oldest 14h',
    severity: 'critical',
    oldestAgeHours: 14,
    href: '/team/fixture-rep-1',
  },
  {
    category: 'FOLLOWUPS_OVERDUE',
    repId: 'fixture-rep-2',
    repName: 'Bilal Ahmed',
    count: 3,
    reason: '3 follow-ups overdue',
    severity: 'attention',
    oldestAgeHours: 72,
    href: '/team/fixture-rep-2',
  },
  {
    category: 'TASKS_OVERDUE',
    repId: 'fixture-rep-3',
    repName: 'Chloe Tan',
    count: 2,
    reason: '2 assigned tasks overdue',
    severity: 'attention',
    oldestAgeHours: 48,
    href: '/team/fixture-rep-3',
  },
]

const team: ManagerHomeTeamData = {
  teamName: 'Revenue Team',
  memberCount: 5,
  needsAttentionCount: 3,
  metrics: {
    repliesWaiting: 6,
    followUpsOverdue: 3,
    highPriority: 4,
    completedToday: 11,
    meetings: 1,
    wins: 0,
  },
  attention,
  rows: [
    { repId: 'fixture-rep-1', repName: 'Ayesha Khan', activeProfile: 'Ayesha LinkedIn', channel: 'linkedin', completedToday: 12, repliesWaiting: 6, followUpsOverdue: 0, highPriority: 2, overdueTasks: 0, meetings: 1, wins: 0, targetPct: 80, status: 'Attention' },
    { repId: 'fixture-rep-2', repName: 'Bilal Ahmed', activeProfile: 'Bilal LinkedIn', channel: 'linkedin', completedToday: 9, repliesWaiting: 0, followUpsOverdue: 3, highPriority: 1, overdueTasks: 0, meetings: 0, wins: 0, targetPct: 64, status: 'Attention' },
    { repId: 'fixture-rep-3', repName: 'Chloe Tan', activeProfile: 'Chloe Upwork', channel: 'upwork', completedToday: 11, repliesWaiting: 0, followUpsOverdue: 0, highPriority: 1, overdueTasks: 2, meetings: 0, wins: 0, targetPct: 71, status: 'Attention' },
    { repId: 'fixture-rep-4', repName: 'Dawood Rizvi', activeProfile: 'Dawood LinkedIn', channel: 'linkedin', completedToday: 14, repliesWaiting: 0, followUpsOverdue: 0, highPriority: 0, overdueTasks: 0, meetings: 0, wins: 0, targetPct: 93, status: 'On track' },
    { repId: 'fixture-rep-5', repName: 'Elena Petrova', activeProfile: 'Elena LinkedIn', channel: 'linkedin', completedToday: 8, repliesWaiting: 0, followUpsOverdue: 0, highPriority: 0, overdueTasks: 0, meetings: 0, wins: 0, targetPct: 53, status: 'On track' },
  ],
  activity: [
    { id: 'fixture-act-1', label: 'Ayesha Khan booked a meeting with Acme Logistics', detail: 'MEETING_BOOKED', occurredAt: new Date(Date.now() - 3 * 3_600_000).toISOString(), href: '/team/fixture-rep-1' },
    { id: 'fixture-act-2', label: 'Bilal Ahmed sent 2 follow-ups', detail: 'FOLLOWUP_SENT', occurredAt: new Date(Date.now() - 5 * 3_600_000).toISOString(), href: '/team/fixture-rep-2' },
    { id: 'fixture-act-3', label: 'Chloe Tan completed a proposal', detail: 'PROPOSAL_SENT', occurredAt: new Date(Date.now() - 8 * 3_600_000).toISOString(), href: '/team/fixture-rep-3' },
  ],
  scopeNote: 'managed_team',
}

export default function QaV4FixturePage() {
  // Unlinked QA surface: only render when explicitly enabled.
  if (process.env.QA_FIXTURE !== '1') notFound()
  const greeting = greetingFor('Asia/Karachi')
  return <V4ManagerHome personal={personal} team={team} greeting={greeting} />
}

function greetingFor(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hourCycle: 'h23' }).formatToParts(new Date())
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
