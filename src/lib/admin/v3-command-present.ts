/**
 * Admin / Owner Command Center V3 presentation — pure mappings over the
 * canonical admin-command-summary assembly. No new scoring, no new data.
 */
import type { AdminCommandCenterData, PipelineStageHealth } from '@/lib/team/admin-command-summary'
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
      href: '/tasks?tab=overdue',
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
  return stages.map((stage) => ({
    key: stage.key,
    label: stage.label,
    count: stage.count,
    href: stage.href,
    conversionPct: stage.conversionPct,
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
    { key: 'prospect', label: 'Analyze prospect', href: '/prospect' },
    { key: 'task', label: 'Assign task', href: '/tasks' },
    { key: 'invite', label: 'Invite person', href: '/admin/people' },
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

function formatClock(iso: string): string {
  const ms = new Date(iso).getTime()
  if (Number.isNaN(ms)) return '--:--'
  return new Date(ms).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}
