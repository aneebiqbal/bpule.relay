import Link from 'next/link'
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { Skeleton } from '@/components/ui/skeleton'
import {
  InlineError,
  LinkTabs,
  MetricStrip,
  Section,
  TimelineTable,
} from '@/components/operations/ops-primitives'
import { OpsFilters } from '@/components/operations/ops-filters'
import { PeopleTable } from '@/components/operations/people-table'
import { ConversationTable } from '@/components/operations/conversation-table'
import { TaskBoard } from '@/components/operations/task-board'
import { FunnelTable, RepComparison, metricsToStrip } from '@/components/operations/performance-views'
import {
  assignableReps,
  getPeopleDirectory,
  getPerformance,
  requireTeamContext,
  type OpsPageContext,
} from '@/lib/operations/page-context'
import { filterRepIdsToScope } from '@/lib/operations/scope'
import { OPS_RANGES, opsHref, parseOpsFilters, rangeWindow, type OpsFilters as Filters } from '@/lib/operations/filters'
import { CONVERSATION_VIEWS, countConversationViews, filterConversationRows, loadConversationRows } from '@/lib/operations/conversations'
import { ACTIVITY_EVENT_FILTERS, loadTimeline } from '@/lib/operations/activity'
import { loadUnifiedTasks } from '@/lib/tasks/load-unified-tasks'
import { isOverdue } from '@/lib/tasks/rank-unified-tasks'
import type { PeopleRow, TeamSummary } from '@/lib/operations/people'

export const dynamic = 'force-dynamic'

const TABS = ['overview', 'people', 'leads', 'tasks', 'activity', 'performance'] as const
type Tab = (typeof TABS)[number]
const TAB_LABEL: Record<Tab, string> = {
  overview: 'Overview',
  people: 'People',
  leads: 'Leads',
  tasks: 'Tasks',
  activity: 'Activity',
  performance: 'Performance',
}

/**
 * Team detail. Admins open any org team; managers only teams they manage —
 * anything else is a 404. Member lists are intersected with operational scope.
 */
export default async function TeamDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ teamId }, sp] = await Promise.all([params, searchParams])
  const ctx = await requireTeamContext()
  if (ctx.scope.mode !== 'org' && !ctx.auth.managedTeamIds.includes(teamId)) notFound()

  const directory = await getPeopleDirectory().catch(() => null)
  if (!directory) return <InlineError>This team could not be loaded.</InlineError>
  const team = directory.teams.find((t) => t.id === teamId)
  if (!team) notFound()

  const memberIds = filterRepIdsToScope(ctx.scope, team.memberIds)
  const members = directory.rows.filter((r) => memberIds.includes(r.repId))
  const filters = parseOpsFilters(sp)
  const tab: Tab = (TABS as readonly string[]).includes(filters.tab ?? '') ? (filters.tab as Tab) : 'overview'
  const base = `/team/groups/${teamId}`

  return (
    <div className="space-y-5">
      <header>
        <nav aria-label="Breadcrumb" className="text-[12px] text-stone">
          <Link href="/team/groups" className="hover:text-ink">
            Teams
          </Link>
          <span aria-hidden="true"> / </span>
          <span>{team.name}</span>
        </nav>
        <h1 className="mt-1 text-[24px] font-medium tracking-[-0.01em] text-ink">{team.name}</h1>
        <p className="mt-0.5 text-[13px] text-graphite">
          Manager: {team.managers.length ? team.managers.map((m) => m.name).join(', ') : 'Not set'} · {memberIds.length} member
          {memberIds.length === 1 ? '' : 's'}
        </p>
      </header>

      <MetricStrip
        metrics={[
          { label: 'Members', value: memberIds.length, href: `${base}?tab=people` },
          { label: 'Active leads', value: team.activeLeads, href: `${base}?tab=leads` },
          { label: 'Replies waiting', value: team.repliesWaiting, href: `${base}?tab=leads&view=waiting_me`, tone: team.repliesWaiting ? 'attention' : 'default' },
          { label: 'Overdue tasks', value: team.overdueTasks, href: `${base}?tab=tasks&view=overdue`, tone: team.overdueTasks ? 'critical' : 'default' },
          { label: 'Meetings today', value: team.meetings, href: '/admin/command', hint: "Today's meeting goal completions (Daily operations)." },
          { label: 'Need attention', value: team.needsAttention, href: `${base}?tab=people` },
        ]}
      />

      <LinkTabs
        label="Team sections"
        active={tab}
        tabs={TABS.map((t) => ({ value: t, label: TAB_LABEL[t], href: t === 'overview' ? base : `${base}?tab=${t}` }))}
      />

      <Suspense key={`${tab}:${JSON.stringify(sp)}`} fallback={<Skeleton className="h-48 w-full rounded-lg" />}>
        {tab === 'overview' && <OverviewTab ctx={ctx} team={team} members={members} memberIds={memberIds} />}
        {tab === 'people' && <PeopleTable rows={members} />}
        {tab === 'leads' && <LeadsTab ctx={ctx} memberIds={memberIds} base={base} filters={filters} />}
        {tab === 'tasks' && <TasksTab ctx={ctx} memberIds={memberIds} view={typeof sp.view === 'string' ? sp.view : null} />}
        {tab === 'activity' && <ActivityTab ctx={ctx} memberIds={memberIds} base={base} filters={filters} />}
        {tab === 'performance' && <PerformanceTab memberIds={memberIds} base={base} filters={filters} />}
      </Suspense>
    </div>
  )
}

async function OverviewTab({
  ctx,
  team,
  members,
  memberIds,
}: {
  ctx: OpsPageContext
  team: TeamSummary
  members: PeopleRow[]
  memberIds: string[]
}) {
  const window = rangeWindow('7d')
  const rows = await loadTimeline(ctx.client, {
    orgId: ctx.auth.orgId,
    repIds: memberIds,
    start: window.start,
    end: window.end,
    limit: 15,
  }).catch(() => null)
  const attention = members.filter((m) => m.status !== 'On track')
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Section title="Who needs help" description={team.description ?? undefined}>
        {attention.length === 0 ? (
          <p className="rounded-lg border border-line px-3 py-3 text-[13px] text-graphite">Everyone is on track.</p>
        ) : (
          <ul className="divide-y divide-line/70 rounded-lg border border-line">
            {attention.map((m) => (
              <li key={m.repId}>
                <Link href={`/team/${m.repId}`} className="flex items-center justify-between gap-2 px-3 py-2 text-[13px] hover:bg-bone-raised">
                  <span className="font-medium text-ink">{m.repName}</span>
                  <span className="text-graphite">
                    {m.repliesWaiting} replies · {m.overdueTasks} overdue · {m.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Recent activity" description="Last 7 days.">
        {rows === null ? (
          <InlineError>Activity could not be loaded.</InlineError>
        ) : (
          <TimelineTable rows={rows} now={Date.now()} empty="No activity in the last 7 days." />
        )}
      </Section>
    </div>
  )
}

async function LeadsTab({ ctx, memberIds, base, filters }: { ctx: OpsPageContext; memberIds: string[]; base: string; filters: Filters }) {
  const now = Date.now()
  const rows = await loadConversationRows(ctx.client, { orgId: ctx.auth.orgId, repIds: memberIds }, now).catch(() => null)
  if (!rows) return <InlineError>Leads could not be loaded.</InlineError>
  const counts = countConversationViews(rows)
  const view = CONVERSATION_VIEWS.some((v) => v.value === filters.view) ? (filters.view as string) : 'all'
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <LinkTabs
          label="Lead views"
          active={view}
          tabs={CONVERSATION_VIEWS.map((v) => ({
            value: v.value,
            label: v.label,
            count: counts[v.value],
            href: opsHref(base, { tab: 'leads' }, { view: v.value === 'all' ? null : v.value }),
          }))}
        />
        <Link href={`/leads?scope=${ctx.leadScope}`} className="text-[12px] text-graphite hover:text-ink">
          Open full leads table →
        </Link>
      </div>
      <ConversationTable rows={filterConversationRows(rows, view)} now={now} showOwner />
    </div>
  )
}

async function TasksTab({ ctx, memberIds, view }: { ctx: OpsPageContext; memberIds: string[]; view: string | null }) {
  const now = Date.now()
  const [all, reps] = await Promise.all([
    loadUnifiedTasks({ auth: ctx.auth, derivedActions: [], includeCompleted: true }),
    assignableReps(ctx),
  ])
  const members = new Set(memberIds)
  const scoped = all.filter((t) => members.has(t.assigneeRepId))
  // The "Overdue tasks" metric deep-links here; honour it instead of ignoring it.
  const visible = view === 'overdue' ? scoped.filter((t) => isOverdue(t, now)) : scoped
  return (
    <TaskBoard
      tasks={visible}
      reps={reps}
      canManage={ctx.scope.mode !== 'own'}
      currentRepId={ctx.auth.repId}
      now={now}
    />
  )
}

async function ActivityTab({ ctx, memberIds, base, filters }: { ctx: OpsPageContext; memberIds: string[]; base: string; filters: Filters }) {
  const window = rangeWindow(filters.range)
  const rows = await loadTimeline(ctx.client, {
    orgId: ctx.auth.orgId,
    repIds: memberIds,
    start: window.start,
    end: window.end,
    event: filters.event,
    limit: 200,
  }).catch(() => null)
  return (
    <div className="space-y-3">
      <OpsFilters
        basePath={base}
        current={{ tab: 'activity', range: filters.range, event: filters.event }}
        filters={[
          { key: 'range', label: 'Date range', options: OPS_RANGES.map((r) => ({ value: r.value, label: r.label })) },
          { key: 'event', label: 'Event type', allLabel: 'All events', options: ACTIVITY_EVENT_FILTERS },
        ]}
      />
      {rows === null ? <InlineError>Activity could not be loaded.</InlineError> : <TimelineTable rows={rows} now={Date.now()} empty="No activity in this window." />}
    </div>
  )
}

async function PerformanceTab({ memberIds, base, filters }: { memberIds: string[]; base: string; filters: Filters }) {
  const window = rangeWindow(filters.range)
  const perf = await getPerformance([...memberIds].sort().join(','), window.start, window.end, null, null).catch(() => null)
  if (!perf) return <InlineError>Performance could not be loaded.</InlineError>
  const activityHref = (event: string | null) => opsHref(base, { tab: 'activity', range: filters.range }, { event })
  return (
    <div className="space-y-5">
      <OpsFilters
        basePath={base}
        current={{ tab: 'performance', range: filters.range }}
        filters={[{ key: 'range', label: 'Date range', options: OPS_RANGES.map((r) => ({ value: r.value, label: r.label })) }]}
      />
      <MetricStrip metrics={metricsToStrip(perf.totals, activityHref)} />
      <Section title="Conversion" description="Leads created in this window, by furthest known stage.">
        <FunnelTable steps={perf.funnel} />
      </Section>
      <Section title="By rep" description="Counts, not a ranking.">
        <RepComparison rows={perf.byRep} rangeQuery={`range=${filters.range}`} />
      </Section>
    </div>
  )
}
