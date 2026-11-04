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

/** The Rep trend series: replies sent, meetings booked, tasks completed. */
export const REP_TREND_SERIES = [
  { key: 'replies', label: 'Replies' },
  { key: 'meetings', label: 'Meetings' },
  { key: 'tasks', label: 'Tasks completed' },
] as const

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
  // All six canonical stages — the strip is a six-column surface and dropping
  // "Won" hid the only outcome reps are measured against.
  //
  // Stage counts are status snapshots, not funnel transitions: a lead currently
  // in "contacted" was once counted under "qualified", so their ratio is not a
  // conversion rate and is deliberately withheld.
  return buildPipelineHealth([...leads]).map((stage) => ({
    key: stage.key,
    label: stage.label,
    count: stage.count,
    href: stage.href,
    conversionPct: null,
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

// ── Dashboard upgrade: today metrics, work breakdown, targets, trend ────────

/** The five canonical today metrics. Values stay null when the truth is unknown. */
export interface RepTodayMetricInput {
  completedToday: number | null
  targetTotal: number
  repliesHandledToday: number | null
  followupsCompletedToday: number | null
  tasksCompletedToday: number | null
  meetingsToday: number | null
  repliesWaiting: number
  followUpsDue: number
  followUpsOverdue: number
  tasksDueToday: number
}

export interface RepTodayMetric {
  key: 'completed' | 'replies' | 'followups' | 'tasks' | 'meetings'
  label: string
  value: number | null
  hint: string
  href: string
  tone: V3Tone
}

/**
 * Today's performance strip. Every value is a canonical count (target
 * accountability, executed activity events, assigned tasks); no derived score.
 */
export function buildRepTodayMetrics(input: RepTodayMetricInput): RepTodayMetric[] {
  const completed = input.completedToday
  const targetMet = input.targetTotal > 0 && completed != null && completed >= input.targetTotal
  return [
    {
      key: 'completed',
      label: 'Completed today',
      value: completed,
      hint: input.targetTotal > 0 ? `${completed ?? 0} of ${input.targetTotal} target` : 'No daily target',
      href: '/dashboard',
      tone: targetMet ? 'success' : 'neutral',
    },
    {
      key: 'replies',
      label: 'Replies handled',
      value: input.repliesHandledToday,
      hint: input.repliesWaiting > 0 ? `${input.repliesWaiting} still waiting` : 'Inbox clear',
      href: '/chats',
      tone: input.repliesWaiting > 0 ? 'warning' : 'neutral',
    },
    {
      key: 'followups',
      label: 'Follow-ups completed',
      value: input.followupsCompletedToday,
      hint:
        input.followUpsOverdue > 0
          ? `${input.followUpsOverdue} overdue`
          : input.followUpsDue > 0
            ? 'Due today'
            : 'Nothing due',
      href: '/leads?filter=followup',
      tone: input.followUpsOverdue > 0 ? 'warning' : 'neutral',
    },
    {
      key: 'tasks',
      label: 'Tasks completed',
      value: input.tasksCompletedToday,
      hint: input.tasksDueToday > 0 ? `${input.tasksDueToday} due today` : 'Queue clear',
      href: '/tasks',
      tone: input.tasksDueToday > 0 ? 'warning' : 'neutral',
    },
    {
      key: 'meetings',
      label: 'Meetings',
      value: input.meetingsToday,
      hint: 'Booked today',
      href: '/reports/sales',
      tone: 'neutral',
    },
  ]
}

export type RepWorkBreakdownKey = 'replies' | 'followups' | 'tasks' | 'prospecting'

export interface RepWorkBreakdownItem {
  key: RepWorkBreakdownKey
  label: string
  value: number
  href: string
}

const WORK_BREAKDOWN_LINKS: Record<RepWorkBreakdownKey, { label: string; href: string }> = {
  replies: { label: 'Replies', href: '/chats' },
  followups: { label: 'Follow-ups', href: '/leads?filter=followup' },
  tasks: { label: 'Tasks', href: '/tasks' },
  prospecting: { label: 'Prospecting', href: '/leads?filter=new' },
}

/**
 * My work breakdown. Unified tasks own the first three categories exactly as
 * the My Work tabs do; prospecting is the canonical high-priority opportunity
 * set. No new scoring.
 */
export function buildRepWorkBreakdown(
  unified: ReadonlyArray<UnifiedTask>,
  ranked: ReadonlyArray<RelayTodayAction>,
): RepWorkBreakdownItem[] {
  const sortedRanked = rankActions([...ranked])
  const replyCount =
    unified.length > 0
      ? unified.filter((task) => classifyUnifiedWorkTab(task) === 'replies').length
      : sortedRanked.filter((action) => (TODAY_REPLY_KINDS as readonly string[]).includes(action.kind)).length
  const followupCount =
    unified.length > 0
      ? unified.filter((task) => classifyUnifiedWorkTab(task) === 'followups').length
      : sortedRanked.filter((action) => (TODAY_FOLLOWUP_KINDS as readonly string[]).includes(action.kind)).length
  const taskCount =
    unified.length > 0
      ? unified.filter((task) => classifyUnifiedWorkTab(task) === 'tasks').length
      : sortedRanked.filter(
          (action) =>
            !(TODAY_REPLY_KINDS as readonly string[]).includes(action.kind) &&
            !(TODAY_FOLLOWUP_KINDS as readonly string[]).includes(action.kind) &&
            !isHighPriorityOpportunity(action),
        ).length

  const values: Record<RepWorkBreakdownKey, number> = {
    replies: replyCount,
    followups: followupCount,
    tasks: taskCount,
    prospecting: sortedRanked.filter(isHighPriorityOpportunity).length,
  }

  return (Object.keys(WORK_BREAKDOWN_LINKS) as RepWorkBreakdownKey[]).map((key) => ({
    key,
    label: WORK_BREAKDOWN_LINKS[key].label,
    value: values[key],
    href: WORK_BREAKDOWN_LINKS[key].href,
  }))
}

export interface RepTargetWindow {
  key: 'daily' | 'weekly' | 'monthly'
  label: string
  done: number | null
  target: number
  /** True when the goal is derived from the daily target × working days. */
  derived: boolean
  pct: number | null
}

/**
 * Target progress. Only the daily window is a stored target; weekly and monthly
 * goals are explicitly labelled derivatives of it so a rep never mistakes a
 * projection for a configured commitment.
 */
export function buildRepTargetWindows(input: {
  dailyDone: number
  dailyTarget: number
  weeklyDone: number | null
  weeklyWorkingDays: number
  monthlyDone: number | null
  monthlyWorkingDays: number
}): RepTargetWindow[] {
  const window = (
    done: number | null,
    workingDays: number,
    derived: boolean,
  ): Pick<RepTargetWindow, 'done' | 'target' | 'derived' | 'pct'> => {
    const target = input.dailyTarget * workingDays
    return {
      done,
      target,
      derived,
      pct: target > 0 && done != null ? Math.round((done / target) * 100) : null,
    }
  }

  return [
    { key: 'daily', label: 'Daily', ...window(input.dailyDone, 1, false) },
    { key: 'weekly', label: 'Weekly', ...window(input.weeklyDone, input.weeklyWorkingDays, true) },
    { key: 'monthly', label: 'Monthly', ...window(input.monthlyDone, input.monthlyWorkingDays, true) },
  ]
}

