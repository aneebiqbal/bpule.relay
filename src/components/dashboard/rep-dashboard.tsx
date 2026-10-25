'use client'

import Link from 'next/link'
import {
  Send, Reply, Bell, AlertTriangle, ChevronRight, Flame, Target, Zap, CheckCircle2,
} from 'lucide-react'
import { cn } from 'cn'
import type { RepWorkspaceData } from '@/components/rep/rep-workspace'
import type { RelayTodayAction } from '@/components/relay-today-workspace'
import { computeDailyProgress } from '@/lib/performance/daily-progress'
import { ContributionHeatmap } from '@/components/performance/contribution-heatmap'
import { DashHeader, EmptyNote, Meter, Panel, Pill, StatTile } from '@/components/dashboard/kit'
import type { DailyActivity, ActivitySummary } from '@/lib/performance/activity-model'
import { useEffect, useState } from 'react'

type ActionKind = RelayTodayAction['kind']

const ACTION_VERB: Record<string, string> = {
  REPLY_NOW: 'Reply',
  SEND_CONNECTION: 'Connect',
  SEND_FIRST_DM: 'Send message',
  SEND_FOLLOWUP: 'Follow up',
  RESEARCH: 'Research',
  REVIEW_REFERRAL: 'Review referral',
  APPLY_UPWORK: 'Apply',
  RESUME_DRAFT: 'Finish draft',
  WAIT: 'Check in',
}

function taskIcon(kind: ActionKind) {
  switch (kind) {
    case 'reply_needed': return <Reply className="size-3.5 text-orange" />
    case 'followup_due': return <Bell className="size-3.5 text-orange" />
    case 'connection_dm_due': return <Send className="size-3.5 text-cobalt" />
    case 'lead_going_cold': return <AlertTriangle className="size-3.5 text-status-warning" />
    case 'inbound_opportunity': return <Flame className="size-3.5 text-orange" />
    case 'job_worth_apply': return <Zap className="size-3.5 text-cobalt" />
    default: return <Target className="size-3.5 text-stone" />
  }
}

function priorityValue(p: string) { return p === 'urgent' ? 0 : p === 'high' ? 1 : p === 'medium' ? 2 : 3 }
function priorityTone(p: string) { return p === 'urgent' ? 'danger' as const : p === 'high' ? 'orange' as const : 'neutral' as const }

/** Canonical "why now" — never raw scorer language. */
function whyNow(task: RelayTodayAction): string {
  if (task.whatHappened) return task.whatHappened
  if (task.kind === 'reply_needed') return 'Client replied — answer while it is fresh'
  if (task.kind === 'followup_due') return 'Follow-up is due'
  if (task.kind === 'connection_dm_due') return 'Connection accepted — send the first message'
  if (task.kind === 'inbound_opportunity') return 'Inbound message needs a response'
  return task.whyItMatters || 'Worth your attention'
}

function senderLine(task: RelayTodayAction): string {
  const name = task.identity?.name
  const title = task.identity?.title
  if (name && title) return `Sending as ${name} · ${title}`
  if (name) return `Sending as ${name}`
  return 'No sender assigned'
}

function dueState(task: RelayTodayAction): string {
  if (task.priority === 'urgent') return 'Now'
  if (task.priority === 'high') return 'Today'
  return 'This week'
}

export function RepDashboard({ data }: { data: RepWorkspaceData }) {
  const { day, nextAction, upNext, referredLeads, recentLeads } = data

  // Rank every actionable task by business urgency. Terminal leads are never
  // returned by the queue engine; this is the rep's only work list.
  const ranked = [...upNext].sort((a, b) => priorityValue(a.priority) - priorityValue(b.priority))

  const replies = ranked.filter((t) => t.kind === 'reply_needed')
  const followups = ranked.filter((t) => t.kind === 'followup_due')
  const highPriority = ranked.filter(
    (t) => t.kind !== 'reply_needed' && t.kind !== 'followup_due' && (t.priority === 'urgent' || t.priority === 'high'),
  )
  const research = ranked.filter((t) => t.kind === 'high_fit_lead' || t.humanAction === 'RESEARCH')
  const newLeads = ranked.filter((t) => t.kind === 'new_opportunity' || t.kind === 'inbound_opportunity')

  const progress = computeDailyProgress({
    totalTarget: data.targetSummary?.totalTarget ?? 0,
    totalCompleted: data.targetSummary?.totalCompleted ?? 0,
    totalRemaining: data.targetSummary?.totalRemaining ?? 0,
    repliesWaiting: day.repliesWaiting ?? 0,
    followUpsDue: day.followUpsDue ?? 0,
    outreachRemaining: day.outreachRemaining ?? 0,
  })

  const totalTarget = data.targetSummary?.totalTarget ?? 0
  const totalCompleted = data.targetSummary?.totalCompleted ?? 0
  const completionPct = progress.progressPct

  const hasWork = ranked.length > 0 || (nextAction != null) || (referredLeads?.length ?? 0) > 0

  return (
    <div className="space-y-6">
      <DashHeader
        eyebrow={new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        title={<>Good {greeting()}, {data.rep.name.split(' ')[0]}</>}
        subtitle={hasWork
          ? 'Here is what needs you right now, in order.'
          : 'You are caught up. Nothing needs attention right now.'}
      />

      {/* Four operational numbers — every one clickable */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Replies waiting" value={day.repliesWaiting ?? 0} tone={(day.repliesWaiting ?? 0) > 0 ? 'orange' : 'neutral'} icon={<Reply className="size-3.5" />} sub={(day.repliesWaiting ?? 0) > 0 ? 'Answer first' : 'Inbox clear'} href="/inbound" />
        <StatTile label="Follow-ups due" value={day.followUpsDue ?? 0} tone={(day.followUpsDue ?? 0) > 0 ? 'warning' : 'neutral'} icon={<Bell className="size-3.5" />} sub={(day.followUpsDue ?? 0) > 0 ? 'Due today' : 'Nothing due'} href="/leads?filter=followup" />
        <StatTile label="High-priority opportunities" value={highPriority.length} tone={highPriority.length > 0 ? 'orange' : 'neutral'} icon={<Flame className="size-3.5" />} sub="Worth acting on" href="/leads" />
        <StatTile label="Done today" value={totalCompleted} tone={progress.status === 'COMPLETE' ? 'success' : 'neutral'} icon={<CheckCircle2 className="size-3.5" />} sub={totalTarget > 0 ? `of ${totalTarget} target` : 'No target set'} href="/accountability" />
      </div>

      {/* DO THIS NEXT — the ranked list, one CTA per row */}
      {ranked.length > 0 ? (
        <Panel
          title="Do this next"
          subtitle={`${ranked.length} ${ranked.length === 1 ? 'action' : 'actions'} ranked by urgency`}
          flush
        >
          <ol className="divide-y divide-line/70">
            {ranked.slice(0, 8).map((task, i) => (
              <li key={`${task.id}-${i}`}>
                <Link href={task.href} className="flex items-start gap-3 px-4 py-3 hover:bg-bone sm:px-5">
                  <span className="mt-0.5 w-5 shrink-0 text-mono-medium text-[11px] text-stone">{String(i + 1).padStart(2, '0')}</span>
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-bone">{taskIcon(task.kind)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">{task.title}</span>
                    <span className="mt-0.5 block truncate text-[12px] text-graphite">{whyNow(task)}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-stone">{senderLine(task)}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <Pill tone={priorityTone(task.priority)}>{dueState(task)}</Pill>
                    <span className="inline-flex items-center gap-0.5 rounded-md bg-solid px-2 py-0.5 text-[11px] font-medium text-on-solid">
                      {ACTION_VERB[task.humanAction ?? ''] ?? 'Open'}
                      <ChevronRight className="size-3" aria-hidden="true" />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
          {ranked.length > 8 && (
            <Link href="/leads" className="block border-t border-line px-4 py-2 text-[12px] font-medium text-cobalt hover:underline sm:px-5">
              View all {ranked.length}
            </Link>
          )}
        </Panel>
      ) : (
        <Panel>
          <div className="flex flex-col items-center py-8 text-center">
            <CheckCircle2 className="size-6 text-status-success" aria-hidden="true" />
            <p className="mt-2 text-[14px] font-medium text-ink">You&rsquo;re caught up</p>
            <p className="mt-1 max-w-sm text-[12px] text-graphite">No replies or follow-ups need attention. Add a lead from Prospect to keep the pipeline moving.</p>
          </div>
        </Panel>
      )}

      {/* Sections — replies, follow-ups, high-priority, research, help/referred */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {replies.length > 0 && (
          <TaskPanel title="Replies requiring action" hint="Clients waiting on you" icon={<Reply className="size-3.5 text-orange" />} tasks={replies} empty={null} />
        )}
        {followups.length > 0 && (
          <TaskPanel title="Follow-ups due" hint="Keep conversations warm" icon={<Bell className="size-3.5 text-orange" />} tasks={followups} empty={null} />
        )}
        {highPriority.length > 0 && (
          <TaskPanel title="High-priority opportunities" hint="Worth acting on now" icon={<Flame className="size-3.5 text-orange" />} tasks={highPriority} empty={null} />
        )}
        {research.length > 0 && (
          <TaskPanel title="Research required" hint="Uncertain but valuable" icon={<Target className="size-3.5 text-stone" />} tasks={research} empty={null} />
        )}
        {newLeads.length > 0 && (
          <TaskPanel title="New qualified leads" hint="Start the conversation" icon={<Send className="size-3.5 text-cobalt" />} tasks={newLeads} empty={null} />
        )}
        {(referredLeads?.length ?? 0) > 0 && (
          <Panel title="Referred to you" subtitle="A teammate sent these your way" flush>
            <ul className="divide-y divide-line/70">
              {referredLeads!.slice(0, 4).map((lead) => (
                <li key={lead.id}>
                  <Link href={`/leads/${lead.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-bone sm:px-5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] text-ink">{lead.company}</p>
                      {lead.canonicalScore != null && <p className="text-[11px] text-stone">Canonical {Math.round(lead.canonicalScore)}/100</p>}
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-stone" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>

      {/* Today's targets — secondary */}
      <Panel
        title="Today's targets"
        subtitle={totalTarget > 0 ? `${totalCompleted} of ${totalTarget} actions` : 'Set by your admin'}
        action={<span className={cn('text-[13px] font-medium tabular-nums', progress.status === 'COMPLETE' ? 'text-status-success' : 'text-ink')}>{progress.status === 'COMPLETE' ? 'Done' : `${completionPct}%`}</span>}
      >
        {totalTarget === 0 ? (
          <EmptyNote>No daily targets assigned yet. Your admin sets them per identity.</EmptyNote>
        ) : (
          <div className="space-y-3">
            <Meter value={completionPct} max={100} className="h-2" />
            {data.targetSummary.byIdentity.filter((identity) => identity.targets.length > 0).map((identity) => (
              <div key={identity.assignmentId} className="grid grid-cols-[1fr_auto] items-center gap-x-3">
                <span className="truncate text-[12px] font-medium text-ink">{identity.identityName}</span>
                <span className="text-mono-medium text-[10px] uppercase tracking-[0.1em] text-stone">{identity.channel}</span>
                <ul className="col-span-2 space-y-1.5">
                  {identity.targets.map((t) => (
                    <li key={t.targetId}>
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="text-graphite">{t.activityType}</span>
                        <span className="tabular-nums text-ink">{t.completedCount}<span className="text-stone">/{t.targetCount}</span></span>
                      </div>
                      <Meter value={t.completedCount} max={t.targetCount} className="mt-1 h-1" />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Recent work — tertiary */}
      {(recentLeads?.length ?? 0) > 0 && (
        <Panel title="Recent work" subtitle="Your latest saved leads" flush>
          <ul className="divide-y divide-line/70">
            {recentLeads!.slice(0, 5).map((lead) => (
              <li key={lead.id}>
                <Link href={`/leads/${lead.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-bone sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-ink">{lead.company}</p>
                  </div>
                  {lead.canonicalScore != null && <Pill>{Math.round(lead.canonicalScore)}/100</Pill>}
                  <ChevronRight className="size-4 shrink-0 text-stone" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <ActivityHeatmapSection />
    </div>
  )
}

function TaskPanel({ title, hint, icon, tasks }: { title: string; hint: string; icon: React.ReactNode; tasks: RelayTodayAction[]; empty: null }) {
  return (
    <Panel title={title} subtitle={hint} action={<Pill>{tasks.length}</Pill>} flush>
      <ul className="divide-y divide-line/70">
        {tasks.slice(0, 5).map((task, i) => (
          <li key={`${task.id}-${i}`}>
            <Link href={task.href} className="flex items-start gap-3 px-4 py-3 hover:bg-bone sm:px-5">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-bone">{taskIcon(task.kind)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-ink">{task.title}</span>
                <span className="mt-0.5 block truncate text-[12px] text-graphite">{whyNow(task)}</span>
                <span className="mt-0.5 block truncate text-[11px] text-stone">{senderLine(task)}</span>
              </span>
              <span className="shrink-0">
                <span className="inline-flex items-center gap-0.5 rounded-md bg-solid px-2 py-0.5 text-[11px] font-medium text-on-solid">
                  {ACTION_VERB[task.humanAction ?? ''] ?? 'Open'}
                  <ChevronRight className="size-3" aria-hidden="true" />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {tasks.length > 5 && (
        <Link href="/leads" className="block border-t border-line px-4 py-2 text-[12px] font-medium text-cobalt hover:underline sm:px-5">
          View all {tasks.length}
        </Link>
      )}
    </Panel>
  )
}

function ActivityHeatmapSection() {
  const [activity, setActivity] = useState<DailyActivity[] | null>(null)
  const [summary, setSummary] = useState<ActivitySummary | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    fetch('/api/performance/activity?range=12w')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { daily: DailyActivity[]; summary: ActivitySummary } | null) => {
        if (cancelled) return
        if (data) { setActivity(data.daily); setSummary(data.summary); setState('ready') } else setState('error')
      })
      .catch(() => { if (!cancelled) setState('error') })
    return () => { cancelled = true }
  }, [])

  if (state === 'error') return null

  return (
    <Panel
      title="Your consistency"
      subtitle="Every logged action over the last 12 weeks"
      action={<Link href="/performance" className="text-[11px] font-medium text-cobalt hover:underline">Full history</Link>}
    >
      {state === 'loading' || !activity || !summary ? (
        <div className="grid animate-pulse gap-5 lg:grid-cols-[1fr_240px]" aria-busy="true">
          <div className="h-[150px] rounded-lg bg-bone" />
          <div className="h-[150px] rounded-lg bg-bone" />
        </div>
      ) : summary.totalActions === 0 ? (
        <div className="py-6 text-center">
          <p className="text-[13px] text-graphite">No activity yet</p>
          <p className="mt-1 text-[11px] text-stone">Your history fills in as you analyze leads, send outreach, follow up and reply.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_240px]">
          <ContributionHeatmap daily={activity} maxCell={30} />
          <div className="grid grid-cols-2 gap-2">
            <ConsistencyStat label="Streak" value={`${summary.currentStreak}d`} icon={<Flame className="size-3 text-orange" />} />
            <ConsistencyStat label="Active days" value={`${summary.activeDays}/${summary.totalDays}`} />
            <ConsistencyStat label="Connections" value={summary.breakdown.connections} />
            <ConsistencyStat label="First DMs" value={summary.breakdown.firstDMs} />
            <ConsistencyStat label="Replies" value={summary.breakdown.replies} />
            <ConsistencyStat label="Wins" value={summary.breakdown.wins} highlight={summary.breakdown.wins > 0} />
          </div>
        </div>
      )}
    </Panel>
  )
}

function ConsistencyStat({ label, value, highlight, icon }: { label: string; value: number | string; highlight?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line/70 bg-bone px-3 py-2">
      <p className="flex items-center gap-1 text-[10px] text-stone">{icon}{label}</p>
      <p className={cn('mt-0.5 text-[16px] font-medium tabular-nums', highlight ? 'text-status-success' : 'text-ink')}>{value}</p>
    </div>
  )
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
