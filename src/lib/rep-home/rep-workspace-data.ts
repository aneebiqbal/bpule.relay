import type { RelayTodayAction } from '@/lib/tasks/relay-today-action'

/**
 * The Home payload. Assembled once by the dashboard loader and consumed by the
 * V4 role homes, so every role reads the same identities, targets and actions.
 */
export interface RepWorkspaceData {
  rep: { id: string; name: string }
  activeWorkspace?: {
    id: string
    identityName: string
    title: string | null
    channel: string
  } | null
  isWorkingDay: boolean
  hasAssignments: boolean
  identities: Array<{
    assignmentId: string
    revenueIdentityId: string
    identityName: string
    title: string | null
    channel: string
    targets: Array<{
      targetId: string
      activityType: string
      targetCount: number
      completedCount: number
      remaining: number
      status: string
    }>
  }>
  targetSummary: {
    totalTarget: number
    totalCompleted: number
    totalRemaining: number
    overallStatus: 'on_track' | 'at_risk' | 'completed' | 'missed'
    byIdentity: Array<{
      assignmentId: string
      revenueIdentityId: string
      identityName: string
      title: string | null
      channel: string
      targets: Array<{
        targetId: string
        activityType: string
        targetCount: number
        completedCount: number
        remaining: number
        status: string
      }>
    }>
  }
  day: {
    totalRemaining: number
    repliesWaiting: number
    followUpsDue: number
    outreachRemaining: number
    isComplete: boolean
  }
  /** The canonical rep day: state, pace, commitments, check-in, close. */
  repDay?: import('@/lib/rep-day/load').RepDayView
  nextAction: RelayTodayAction | null
  upNext: RelayTodayAction[]
  /** Full canonical action list; the desk sections and the Today KPI share it. */
  allActions: RelayTodayAction[]
  outcomeEvents?: { meetings: number; wins: number; connections?: number; repliesSent?: number; proposals?: number } | null
  /** Unified derived + assigned tasks for Home ranking and /tasks parity. */
  unifiedTasks?: import('@/lib/tasks/types').UnifiedTask[]
  notifications: Array<{ id: string; title: string; body: string }>
  profilesPulled?: number
  isManager?: boolean
  teamName?: string
  teamMembers?: any[]
  referredLeads?: Array<{ id: string; company: string; score: number | null; canonicalScore: number | null; referredAt: string | null }>
  recentLeads?: Array<{ id: string; company: string; score: number | null; canonicalScore: number | null; createdAt: string }>
  upworkJobs?: Array<{ id: string; title: string; company: string; canonicalScore: number | null; fitScore: number | null }>
  completion?: { done: number; remaining: number }
  resumeWork?: Array<{ id: string; company: string; contactName: string | null; lastAction: string; state: string }>
  signalFeed?: import('@/lib/relay/signal-watch').SignalFeedItem[]
  /** Canonical operational timeline for Today / recent (max 5). */
  activity?: import('@/lib/operations/activity').TimelineRow[]
  /** 12-week canonical daily activity for the heatmap and trend (null when unavailable). */
  activityDaily?: import('@/lib/performance/activity-model').DailyActivity[] | null
  /** Pre-merged 12-week trend points (replies, meetings, tasks) for the chart. */
  trendPoints?: import('@/lib/performance/activity-model').ActivityTrendPoint[] | null
  /** Assigned tasks completed today — the task truth, not action events. */
  tasksCompletedToday?: number | null
  /** Target windows for the progress visual; weekly/monthly goals are derived. */
  targetWindows?: {
    dailyDone: number
    dailyTarget: number
    weeklyDone: number | null
    weeklyWorkingDays: number
    monthlyDone: number | null
    monthlyWorkingDays: number
  } | null
  /** Open leads shaped for the canonical pipeline funnel. */
  pipelineLeads?: import('@/lib/team/admin-command-summary').OpenLeadFact[]
  onRefreshSignals?: () => void
  onDismissSignal?: (id: string) => void
}
