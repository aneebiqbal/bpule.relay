/**
 * Rep Home V3 presentation — pure mappings over canonical state.
 *
 * No data loading and no new scoring: everything here maps the canonical
 * rankNextActions / UnifiedTask / pipeline-funnel results into the six-section
 * Home contract. Kept pure so the named product tests can pin each rule.
 */
import type { UnifiedTask } from '@/lib/tasks/types'
import type { RelayTodayAction } from '@/components/relay-today-workspace'
import {
  TODAY_FOLLOWUP_KINDS,
  TODAY_REPLY_KINDS,
  deriveTodayCounts,
} from '@/lib/relay/today-counts'
import { buildPipelineHealth, type OpenLeadFact } from '@/lib/team/admin-command-summary'
import type { TimelineRow } from '@/lib/operations/activity'
import {
  actionDeepLink,
  humanWhyNow,
  isHighPriorityOpportunity,
  overdueSeverity,
  primaryCtaLabel,
  rankActions,
  relativeWait,
} from './action-presentation'

export const REP_V3_ACTION_LIMIT = 5
export const REP_V3_ACTIVITY_LIMIT = 5

export type RepV3Priority = 'critical' | 'high' | 'normal'
export type RepV3WorkTab = 'replies' | 'followups' | 'tasks' | 'pipeline'

export type V3Tone = 'neutral' | 'danger' | 'warning' | 'success'

export interface RepV3Metric {
  key: 'needsAction' | 'replies' | 'followups' | 'tasks'
  label: string
  value: number
  hint: string
  href: string
  tone: V3Tone
}

export const REP_V3_METRIC_TONE_TEXT: Record<V3Tone, string> = {
  neutral: 'text-ink',
  danger: 'text-status-danger',
  warning: 'text-status-warning',
  success: 'text-status-success',
}

export interface RepV3Action {
  id: string
  priority: RepV3Priority
  title: string
  context: string
  whyNow: string
  age: string
  ctaLabel: string
  href: string
}

export interface RepV3Stage {
  key: string
  label: string
  count: number
  href: string
  conversionPct: number | null
}

export interface RepV3ActivityItem {
  id: string
  time: string
  label: string
  detail: string | null
  href: string | null
}

export const REP_V3_EMPTY_STATE = {
  title: "You're caught up.",
  body: 'No replies, follow-ups or tasks need attention right now.',
  cta: 'Analyze a prospect',
  href: '/prospect',
} as const

/** The persistent primary action on Rep Home (REP_V3_CREATE_PROSPECT_VISIBLE). */
export const REP_V3_PRIMARY_CTA = { label: 'Analyze Prospect', href: '/prospect' } as const

export const REP_V3_PROFILE_LABEL = 'Working as' as const

export function buildRepV3ProfileMeta(identity: {
  identityName: string
  title: string | null
} | null | undefined): string | null {
  if (!identity) return null
  return [identity.identityName, identity.title].filter(Boolean).join(' · ')
}

export const REP_V3_SECTION_ERROR = "We couldn't load this section." as const

/** Never render driver/parser internals to a rep (REP_V3_ERROR_SANITIZATION). */
export function sanitizeRepV3Error(_error?: unknown): string {
  void _error
  return REP_V3_SECTION_ERROR
}

function toRepPriority(priority: string): RepV3Priority {
  if (priority === 'urgent' || priority === 'CRITICAL') return 'critical'
  if (priority === 'high' || priority === 'HIGH') return 'high'
  return 'normal'
}

export interface RepV3MetricInput {
  /** Ranked actions that require a rep decision. */
  actionable: number
  urgent: number
  repliesWaiting: number
  repliesOlderThan4h: number
  followUpsDue: number
  followUpsOverdue: number
  openTasks: number
  tasksDueToday: number
}

export function buildRepV3Metrics(input: RepV3MetricInput): RepV3Metric[] {
  return [
    {
      key: 'needsAction',
      label: 'Needs action',
      value: input.actionable,
      hint: input.urgent > 0 ? `${input.urgent} urgent` : 'Ranked for you',
      href: '/dashboard',
      tone: input.urgent > 0 ? 'danger' : 'neutral',
    },
    {
      key: 'replies',
      label: 'Replies',
      value: input.repliesWaiting,
      hint:
        input.repliesWaiting === 0
          ? 'Inbox clear'
          : input.repliesOlderThan4h > 0
            ? `${input.repliesOlderThan4h} older than 4h`
            : 'Answer while fresh',
      href: '/chats',
      tone: input.repliesOlderThan4h > 0 ? 'warning' : 'neutral',
    },
    {
      key: 'followups',
      label: 'Follow-ups',
      value: input.followUpsDue,
      hint:
        input.followUpsDue === 0
          ? 'Nothing due'
          : input.followUpsOverdue > 0
            ? `${input.followUpsOverdue} overdue`
            : 'Due today',
      href: '/leads?filter=followup',
      tone: input.followUpsOverdue > 0 ? 'warning' : 'neutral',
    },
    {
      key: 'tasks',
      label: 'Tasks',
      value: input.openTasks,
      hint: input.tasksDueToday > 0 ? `${input.tasksDueToday} due today` : 'Queue clear',
      href: '/tasks',
      tone: input.tasksDueToday > 0 ? 'warning' : 'neutral',
    },
  ]
}

/** The ranked "Do this next" list, capped at five (REP_V3_ACTION_LIMIT). */
export function buildRepV3Actions(
  unified: ReadonlyArray<UnifiedTask>,
  ranked: ReadonlyArray<RelayTodayAction>,
): RepV3Action[] {
  if (unified.length > 0) {
    return unified.slice(0, REP_V3_ACTION_LIMIT).map((task) => ({
      id: task.id,
      priority: toRepPriority(task.priority),
      title: task.title,
      context: [task.companyName, task.profileName].filter(Boolean).join(' · '),
      whyNow: task.reason,
      age: relativeWait(task.dueAt ?? task.createdAt),
      ctaLabel: task.action.label,
      href: task.action.href,
    }))
  }
  return rankActions([...ranked])
    .slice(0, REP_V3_ACTION_LIMIT)
    .map((action) => ({
      id: action.id,
      priority: toRepPriority(action.priority),
      title: action.title,
      context: [action.subtitle, action.identity?.name].filter(Boolean).join(' · '),
      whyNow: humanWhyNow(action),
      age: relativeWait(action.createdAt),
      ctaLabel: primaryCtaLabel(action),
      href: actionDeepLink(action),
    }))
}

/** Compact My Work tabs. Unified tasks own the first three; ranked opportunities own Pipeline. */
export function classifyUnifiedWorkTab(task: UnifiedTask): Exclude<RepV3WorkTab, 'pipeline'> {
  if (task.kind === 'REPLY') return 'replies'
  if (task.kind === 'FOLLOW_UP') return 'followups'
  return 'tasks'
}

export function selectRepV3WorkRows(
  tab: RepV3WorkTab,
  unified: ReadonlyArray<UnifiedTask>,
  ranked: ReadonlyArray<RelayTodayAction>,
): Array<UnifiedTask | RelayTodayAction> {
  if (tab === 'pipeline') return [...ranked].filter(isHighPriorityOpportunity).slice(0, 8)
  if (unified.length > 0) {
    return unified.filter((task) => classifyUnifiedWorkTab(task) === tab).slice(0, 8)
  }
  const kinds =
    tab === 'replies'
      ? (TODAY_REPLY_KINDS as readonly string[])
      : tab === 'followups'
        ? (TODAY_FOLLOWUP_KINDS as readonly string[])
        : null
  const rankedRows = rankActions([...ranked])
  if (tab === 'tasks') return rankedRows.filter((a) => !isHighPriorityOpportunity(a)).slice(0, 8)
  return kinds ? rankedRows.filter((a) => kinds.includes(a.kind)).slice(0, 8) : []
}

export function countRepV3DueToday(unified: ReadonlyArray<UnifiedTask>, now = Date.now()): number {
  return unified.filter((task) => {
    if (!task.dueAt) return false
    const due = new Date(task.dueAt).getTime()
    return !Number.isNaN(due) && due >= now - 24 * 3_600_000 && due <= now + 24 * 3_600_000
  }).length
}

export function buildRepV3Stages(leads: ReadonlyArray<OpenLeadFact>): RepV3Stage[] {
  return buildPipelineHealth([...leads])
    .slice(0, 5)
    .map((stage) => ({
      key: stage.key,
      label: stage.label,
      count: stage.count,
      href: stage.href,
      conversionPct: stage.conversionPct,
    }))
}

export function buildRepV3Activity(rows: ReadonlyArray<TimelineRow>): RepV3ActivityItem[] {
  return rows.slice(0, REP_V3_ACTIVITY_LIMIT).map((row) => {
    const lead = row.leadLabel ?? row.company ?? null
    return {
      id: row.id,
      time: formatClock(row.at),
      label: lead ? `${row.event} · ${lead}` : row.event,
      detail: row.result,
      href: row.href,
    }
  })
}

function formatClock(iso: string): string {
  const ms = new Date(iso).getTime()
  if (Number.isNaN(ms)) return '--:--'
  return new Date(ms).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function deriveRepV3MetricInput(args: {
  ranked: ReadonlyArray<RelayTodayAction>
  openTasks: number
  tasksDueToday: number
  now?: number
}): RepV3MetricInput {
  const now = args.now ?? Date.now()
  const counts = deriveTodayCounts(args.ranked)
  const actionable = args.ranked.filter((a) => a.priority !== 'low').length
  return {
    actionable: actionable || args.ranked.length,
    urgent: args.ranked.filter((a) => a.priority === 'urgent').length,
    repliesWaiting: counts.repliesWaiting,
    repliesOlderThan4h: args.ranked.filter(
      (a) =>
        (TODAY_REPLY_KINDS as readonly string[]).includes(a.kind) &&
        ['attention', 'critical'].includes(overdueSeverity(a.createdAt, now)),
    ).length,
    followUpsDue: counts.followUpsDue,
    followUpsOverdue: args.ranked.filter(
      (a) =>
        (TODAY_FOLLOWUP_KINDS as readonly string[]).includes(a.kind) &&
        overdueSeverity(a.createdAt, now) !== 'none',
    ).length,
    openTasks: args.openTasks,
    tasksDueToday: args.tasksDueToday,
  }
}
