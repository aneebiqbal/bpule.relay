/**
 * Admin / Owner Command Center V3 presentation — pure mappings over the
 * canonical admin-command-summary assembly. No new scoring, no new data.
 */
import type { AdminCommandCenterData, PipelineStageHealth, ProfilePerformanceRow } from '@/lib/team/admin-command-summary'
import type { AttentionSignal } from '@/lib/team/attention-policy'
import type { ManagerActivityItem, ManagerTeamRow } from '@/lib/team/manager-home-summary'

export const ADMIN_V3_ATTENTION_LIMIT = 6
export const ADMIN_V3_ACTIVITY_LIMIT = 5

export const ADMIN_V3_SECTION_ERROR = "We couldn't load this section." as const

export interface AdminV3Metric {
  key: string
  label: string
  value: number
  hint: string
  href: string
  tone: 'neutral' | 'danger' | 'warning' | 'success'
}

export interface AdminV3AttentionRow {
  id: string
  severity: 'critical' | 'attention' | 'normal'
  name: string
  reason: string
  ctaLabel: string
  href: string
}

export interface AdminV3PersonRow {
  id: string
  name: string
  role: string | null
  stats: Array<{ label: string; value: number | string }>
  targetPct: number
  status: string
  href: string
}

export interface AdminV3Stage {
  key: string
  label: string
  count: number
  href: string
  conversionPct: number | null
}

export interface AdminV3ActivityItem {
  id: string
  time: string
  label: string
  detail: string | null
  href: string | null
}

export interface AdminV3QuickAction {
  key: string
  label: string
  href: string
  ownerOnly?: boolean
}

/** Canonical attention CTA per category. */
export function attentionCtaLabel(category: string): string {
  switch (category) {
    case 'REPLIES_WAITING':
      return 'Open replies'
    case 'FOLLOWUPS_OVERDUE':
      return 'View follow-ups'
    case 'HIGH_PRIORITY_UNTOUCHED':
      return 'Review opportunities'
    case 'TASKS_OVERDUE':
      return 'Review tasks'
    case 'NO_PROFILE_ASSIGNMENT':
      return 'Resolve'
    case 'TARGET_AT_RISK':
      return 'Open rep'
    default:
      return 'Review'
  }
}

function toSeverity(severity: AttentionSignal['severity']): AdminV3AttentionRow['severity'] {
  return severity === 'critical' || severity === 'attention' ? severity : 'normal'
}

export function buildAdminV3Health(data: AdminCommandCenterData): AdminV3Metric[] {
  return [
    {
      key: 'opportunities',
      label: 'Active opportunities',
      value: data.health.activeOpportunities,
      hint: 'Non-terminal open leads',
      href: '/leads',
      tone: 'neutral',
    },
    {
      key: 'replies',
      label: 'Replies waiting',
      value: data.health.repliesWaiting,
      hint: data.health.repliesCritical > 0 ? `${data.health.repliesCritical} critical` : 'Org-wide',
      href: '/chats',
      tone: data.health.repliesCritical > 0 ? 'danger' : data.health.repliesWaiting > 0 ? 'warning' : 'neutral',
    },
    {
      key: 'overdueTasks',
      label: 'Overdue tasks',
      value: data.health.overdueTasks,
      hint: data.health.overdueTasks > 0 ? 'Past due assigned work' : 'Assigned work clear',
      href: '/tasks?view=overdue',
      tone: data.health.overdueTasks > 0 ? 'warning' : 'neutral',
    },
    {
      key: 'meetings',
      label: 'Meetings this week',
      value: data.health.meetingsThisWeek,
      hint: 'Canonical outcome events',
      href: '/reports/sales',
      tone: 'neutral',
    },
    {
      key: 'wins',
      label: 'Wins',
      value: data.health.wins,
      hint: 'This week + today',
      href: '/leads?filter=won',
      tone: data.health.wins > 0 ? 'success' : 'neutral',
    },
  ]
}

export function buildAdminV3Attention(signals: ReadonlyArray<AttentionSignal>): AdminV3AttentionRow[] {
  return signals.slice(0, ADMIN_V3_ATTENTION_LIMIT).map((signal) => ({
    id: `${signal.repId}-${signal.category}-${signal.count}`,
    severity: toSeverity(signal.severity),
    name: signal.repName,
    reason: signal.reason,
    ctaLabel: attentionCtaLabel(signal.category),
    href: signal.href,
  }))
}

export function buildAdminV3TeamRows(rows: ReadonlyArray<ManagerTeamRow>): AdminV3PersonRow[] {
  return rows.map((row) => ({
    id: row.repId,
    name: row.repName,
    role: row.activeProfile,
    stats: [
      { label: 'Done', value: row.completedToday },
      { label: 'Replies', value: row.repliesWaiting },
      { label: 'Follow-ups', value: row.followUpsOverdue },
      { label: 'Priority', value: row.highPriority },
      { label: 'Meetings', value: row.meetings },
    ],
    targetPct: row.targetPct,
    status: row.status,
    href: `/team/${row.repId}`,
  }))
}

export function buildAdminV3Pipeline(stages: ReadonlyArray<PipelineStageHealth>): AdminV3Stage[] {
  // Stage counts are status snapshots, not funnel transitions, so the ratio is
  // withheld rather than presented as a conversion rate.
  return stages.map((stage) => ({
    key: stage.key,
    label: stage.label,
    count: stage.count,
    href: stage.href,
    conversionPct: null,
  }))
}

export function buildAdminV3Activity(items: ReadonlyArray<ManagerActivityItem>): AdminV3ActivityItem[] {
  return items.slice(0, ADMIN_V3_ACTIVITY_LIMIT).map((item) => ({
    id: item.id,
    time: formatClock(item.occurredAt),
    label: item.label,
    detail: item.detail || null,
    href: item.href,
  }))
}

/**
 * Quick actions. Owner-only links point at surfaces that exist today; literal
 * Integrations / Security / Billing pages are not part of Sprint 1.
 * shortcut: owner extras map to nearest canonical admin surfaces, revisit when dedicated pages ship.
 */
export function buildAdminV3QuickActions(isOwner: boolean): AdminV3QuickAction[] {
  const actions: AdminV3QuickAction[] = [
    { key: 'prospect', label: 'Analyze Prospect', href: '/prospect' },
    { key: 'task', label: 'Assign Task', href: '/tasks' },
    { key: 'invite', label: 'Invite Person', href: '/admin/people' },
    { key: 'overdue', label: 'Review overdue work', href: '/leads?filter=followup' },
    { key: 'reports', label: 'Open reports', href: '/reports/sales' },
  ]
  if (isOwner) {
    actions.push(
      { key: 'people', label: 'People & Roles', href: '/admin/people', ownerOnly: true },
      { key: 'profiles', label: 'Profiles & identities', href: '/manage-profiles', ownerOnly: true },
      { key: 'targets', label: 'Targets', href: '/admin/targets', ownerOnly: true },
      { key: 'aiUsage', label: 'AI usage', href: '/admin/ai-usage', ownerOnly: true },
    )
  }
  return actions
}

export function sanitizeAdminV3Error(_error?: unknown): string {
  void _error
  return ADMIN_V3_SECTION_ERROR
}

// ── Dashboard upgrade: team execution, comparison, profiles ────────────────

/** Today's executed activity per rep — the same rule Team Performance uses. */
export interface AdminRepExecution {
  /** Replies sent today (not replies waiting). */
  repliesSent: number
  /** Follow-ups sent today. */
  followupsSent: number
}

/**
 * Per-rep executed activity for today's team view. Failed executions never
 * count and generated drafts (*_PREPARED) are not in the source set, so a
 * rep's "handled" numbers can never be inflated by a send that did not happen.
 */
export function buildAdminExecutionByRep(
  events: ReadonlyArray<{
    action_type: string
    actor_id: string | null
    execution_status?: string | null
  }>,
): Map<string, AdminRepExecution> {
  const out = new Map<string, AdminRepExecution>()
  for (const event of events) {
    if (!event.actor_id || event.execution_status === 'failed') continue
    if (event.action_type !== 'REPLY_SENT' && event.action_type !== 'FOLLOWUP_SENT') continue
    const current = out.get(event.actor_id) ?? { repliesSent: 0, followupsSent: 0 }
    if (event.action_type === 'REPLY_SENT') current.repliesSent += 1
    else current.followupsSent += 1
    out.set(event.actor_id, current)
  }
  return out
}

export const ADMIN_TEAM_METRICS = [
  { key: 'completed', label: 'Completed' },
  { key: 'replies', label: 'Replies' },
  { key: 'meetings', label: 'Meetings' },
  { key: 'tasks', label: 'Tasks' },
] as const

export type AdminTeamMetricKey = (typeof ADMIN_TEAM_METRICS)[number]['key']

export interface AdminTeamCompareRow {
  id: string
  name: string
  status: string
  href: string
  values: Record<AdminTeamMetricKey, number>
}

/**
 * Per-rep comparison rows. Every metric is a canonical count: target
 * completions, executed replies (not replies waiting), outcome-event meetings,
 * and assigned-task completions. No combined performance score.
 */
export function buildAdminTeamCompare(
  rows: ReadonlyArray<ManagerTeamRow>,
  execution: ReadonlyMap<string, AdminRepExecution> | null,
  tasksByRep: ReadonlyMap<string, number> | null,
): AdminTeamCompareRow[] {
  return rows
    .map((row) => {
      const ex = execution?.get(row.repId)
      return {
        id: row.repId,
        name: row.repName,
        status: row.status,
        href: `/team/${row.repId}`,
        values: {
          completed: row.completedToday,
          replies: ex?.repliesSent ?? 0,
          meetings: row.meetings,
          tasks: tasksByRep?.get(row.repId) ?? 0,
        },
      }
    })
    .sort((a, b) => b.values.completed - a.values.completed || a.name.localeCompare(b.name))
}

export interface AdminExecutionRow {
  key: 'completed' | 'replies' | 'followups' | 'tasks' | 'meetings'
  label: string
  value: number | null
  hint?: string
  href?: string
}

/**
 * Team progress visual. `completed` is target accountability; the rest are
 * today's executed events and task truth. Values stay null when not loaded.
 */
export function buildAdminExecutionRows(input: {
  completedToday: number | null
  repliesHandled: number | null
  followupsCompleted: number | null
  tasksCompleted: number | null
  meetings: number | null
}): AdminExecutionRow[] {
  return [
    {
      key: 'completed',
      label: 'Completed',
      value: input.completedToday,
      hint: 'Target completions',
      href: '/admin/command',
    },
    {
      key: 'replies',
      label: 'Replies handled',
      value: input.repliesHandled,
      hint: 'Executed today',
      href: '/chats',
    },
    {
      key: 'followups',
      label: 'Follow-ups',
      value: input.followupsCompleted,
      hint: 'Executed today',
      href: '/leads?filter=followup',
    },
    {
      key: 'tasks',
      label: 'Tasks completed',
      value: input.tasksCompleted,
      hint: 'Assigned tasks',
      href: '/tasks',
    },
    {
      key: 'meetings',
      label: 'Meetings',
      value: input.meetings,
      hint: 'Booked today',
      href: '/reports/sales',
    },
  ]
}

export interface AdminProfileRow {
  identityId: string
  name: string
  channel: string
  leads: number
  replies: number
  /** Replies / messages sent; null when nothing was sent — never 0%. */
  replyRate: number | null
  meetings: number
  proposals: number
  wins: number
}

/** Profile performance, ranked by assigned pipeline then wins. */
export function buildAdminProfileRows(profiles: ReadonlyArray<ProfilePerformanceRow>): AdminProfileRow[] {
  return profiles.map((profile) => ({
    identityId: profile.identityId,
    name: profile.name,
    channel: profile.channel,
    leads: profile.assignedLeads,
    replies: profile.replies,
    replyRate: profile.replyRate,
    meetings: profile.meetings,
    proposals: profile.proposals,
    wins: profile.wins,
  }))
}

export const ADMIN_TREND_SERIES: Array<{ key: 'replies' | 'meetings' | 'wins'; label: string }> = [
  { key: 'replies', label: 'Replies' },
  { key: 'meetings', label: 'Meetings' },
  { key: 'wins', label: 'Wins' },
]

function formatClock(iso: string): string {
  const ms = new Date(iso).getTime()
  if (Number.isNaN(ms)) return '--:--'
  return new Date(ms).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}
