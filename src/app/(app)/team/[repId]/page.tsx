import Link from 'next/link'
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { Skeleton } from '@/components/ui/skeleton'
import {
  InlineError,
  LinkTabs,
  MetricStrip,
  RepStatusBadge,
  Section,
  TimelineTable,
} from '@/components/operations/ops-primitives'
import { OpsFilters } from '@/components/operations/ops-filters'
import { InterventionMenu } from '@/components/operations/intervention-menu'
import { NotesPanel } from '@/components/operations/notes-panel'
import { ConversationTable } from '@/components/operations/conversation-table'
import { TaskBoard } from '@/components/operations/task-board'
import { FunnelTable, ProfileComparison, metricsToStrip } from '@/components/operations/performance-views'
import { LeadsTable } from '@/components/leads/leads-table'
import {
  assignableReps,
  getPeopleDirectory,
  getPerformance,
  requireTeamContext,
  type OpsPageContext,
} from '@/lib/operations/page-context'
import { canInterveneOnRep, repInScope } from '@/lib/operations/scope'
import { OPS_RANGES, opsHref, parseOpsFilters, rangeWindow, type OpsFilters as Filters } from '@/lib/operations/filters'
import { loadRepBasics, buildRepAttention, type RepBasics } from '@/lib/operations/rep-360'
import {
  CONVERSATION_VIEWS,
  countConversationViews,
  filterConversationRows,
  loadConversationRows,
} from '@/lib/operations/conversations'
import { ACTIVITY_EVENT_FILTERS, loadTimeline } from '@/lib/operations/activity'
import { loadUnifiedTasks } from '@/lib/tasks/load-unified-tasks'
import { countOverdueUnifiedTasks } from '@/lib/tasks/rank-unified-tasks'
import { loadLeadsPage, parseLeadsQuery } from '@/lib/leads/leads-page'

export const dynamic = 'force-dynamic'

const TABS = ['overview', 'leads', 'tasks', 'conversations', 'activity', 'performance'] as const
type Tab = (typeof TABS)[number]
const TAB_LABEL: Record<Tab, string> = {
  overview: 'Overview',
  leads: 'Leads',
  tasks: 'Tasks',
  conversations: 'Conversations',
  activity: 'Activity',
  performance: 'Performance',
}

type SearchParams = Record<string, string | string[] | undefined>

/**
 * Rep 360 — one rep's whole operational picture, so a manager never needs
 * five pages to understand one person. The header is light; metrics stream;
 * only the active tab's data is loaded.
 */
export default async function Rep360Page({
  params,
  searchParams,
}: {
  params: Promise<{ repId: string }>
  searchParams: Promise<SearchParams>
}) {
  const [{ repId }, sp] = await Promise.all([params, searchParams])
  const ctx = await requireTeamContext()
  // Out-of-scope rep ids are indistinguishable from unknown ones.
  if (!repInScope(ctx.scope, repId)) notFound()
  const basics = await loadRepBasics(ctx.client, ctx.auth, repId)
  if (!basics) notFound()

  const filters = parseOpsFilters(sp)
  const tab: Tab = (TABS as readonly string[]).includes(filters.tab ?? '') ? (filters.tab as Tab) : 'overview'
  const canAssign = canInterveneOnRep(ctx.scope, repId)
  const reps = canAssign ? await assignableReps(ctx) : []
  const base = `/team/${repId}`
  const activeProfile = basics.identities[0] ?? null

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="text-[12px] text-stone">
            <Link href="/team" className="hover:text-ink">
              Team
            </Link>
            <span aria-hidden="true"> / </span>
            <span>{basics.name}</span>
          </nav>
          <h1 className="mt-1 text-[24px] font-medium tracking-[-0.01em] text-ink">{basics.name}</h1>
          <p className="mt-0.5 text-[13px] text-graphite">
            {[activeProfile?.title, basics.teams.map((t) => t.name).join(', ') || null].filter(Boolean).join(' · ') || 'No team'}
          </p>
          <p className="mt-1 text-[13px] text-graphite">
            Active profile:{' '}
            {activeProfile ? (
              <span className="text-ink">{activeProfile.name}</span>
            ) : (
              <span className="text-status-warning">No profile assigned</span>
            )}
            <Suspense fallback={null}>
              <HeaderStatus repId={repId} />
            </Suspense>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/command/${repId}`}
            className="inline-flex h-8 items-center rounded-lg border border-line bg-bone px-2.5 text-[13px] text-ink hover:bg-bone-raised"
          >
            Daily operations
          </Link>
          <InterventionMenu repId={repId} reps={reps} canAssign={canAssign} notesAnchor={tab === 'overview' ? '#notes' : `${base}#notes`} />
        </div>
      </header>

      <Suspense fallback={<Skeleton className="h-[62px] w-full rounded-lg" />}>
        <RepMetrics repId={repId} />
      </Suspense>

      <LinkTabs
        label="Rep sections"
        active={tab}
        tabs={TABS.map((t) => ({ value: t, label: TAB_LABEL[t], href: t === 'overview' ? base : `${base}?tab=${t}` }))}
      />

      <Suspense key={`${tab}:${JSON.stringify(sp)}`} fallback={<TabSkeleton />}>
        {tab === 'overview' && <OverviewTab ctx={ctx} basics={basics} />}
        {tab === 'leads' && <LeadsTab repId={repId} sp={sp} leadScope={ctx.leadScope} />}
        {tab === 'tasks' && <TasksTab ctx={ctx} repId={repId} reps={reps} canAssign={canAssign} />}
        {tab === 'conversations' && <ConversationsTab ctx={ctx} repId={repId} filters={filters} />}
        {tab === 'activity' && <ActivityTab ctx={ctx} repId={repId} filters={filters} />}
        {tab === 'performance' && <PerformanceTab repId={repId} filters={filters} />}
      </Suspense>
    </div>
  )
}

function TabSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-9 w-full rounded-lg" />
      <Skeleton className="h-40 w-full rounded-lg" />
    </div>
  )
}

async function HeaderStatus({ repId }: { repId: string }) {
  const directory = await getPeopleDirectory().catch(() => null)
  const row = directory?.rows.find((r) => r.repId === repId)
  if (!row) return null
  return (
    <span className="ml-2 inline-flex align-middle">
      <span className="sr-only">Status:</span>
      <RepStatusBadge status={row.status} />
    </span>
  )
}

async function RepMetrics({ repId }: { repId: string }) {
  const week = rangeWindow('7d')
  const [directory, perf] = await Promise.all([
    getPeopleDirectory().catch(() => null),
    getPerformance(repId, week.start, week.end, null, null).catch(() => null),
  ])
  const row = directory?.rows.find((r) => r.repId === repId) ?? null
  if (!row && !perf) return <InlineError>Metrics could not be loaded.</InlineError>
  const base = `/team/${repId}`
  return (
    <MetricStrip
      metrics={[
        { label: 'Completed today', value: row?.completedToday ?? '—', href: `${base}?tab=activity&range=today` },
        { label: 'Replies waiting', value: row?.repliesWaiting ?? '—', href: `${base}?tab=conversations&view=waiting_me`, tone: row?.repliesWaiting ? 'attention' : 'default' },
        { label: 'Follow-ups due', value: row?.followUpsOverdue ?? '—', href: `${base}?tab=conversations&view=followups` },
        { label: 'Tasks overdue', value: row?.overdueTasks ?? '—', href: `${base}?tab=tasks&view=overdue`, tone: row?.overdueTasks ? 'critical' : 'default' },
        { label: 'Meetings · 7d', value: perf?.totals.meetings ?? '—', href: `${base}?tab=activity&event=MEETING_BOOKED&range=7d` },
        { label: 'Proposals · 7d', value: perf?.totals.proposals ?? '—', href: `${base}?tab=activity&event=UPWORK_PROPOSAL_PREPARED&range=7d` },
        { label: 'Wins · 7d', value: perf?.totals.wins ?? '—', href: `${base}?tab=activity&event=CLIENT_WON&range=7d` },
        { label: 'Target today', value: row ? `${Math.round(row.targetPct)}%` : '—', href: `/admin/command/${repId}` },
      ]}
    />
  )
}

async function OverviewTab({ ctx, basics }: { ctx: OpsPageContext; basics: RepBasics }) {
  const now = Date.now()
  const today = rangeWindow('today')
  const week = rangeWindow('7d')
  const [directory, conversations, tasks, todayPerf, weekPerf] = await Promise.all([
    getPeopleDirectory().catch(() => null),
    loadConversationRows(ctx.client, { orgId: ctx.auth.orgId, repIds: [basics.id] }, now).catch(() => []),
    loadUnifiedTasks({ auth: ctx.auth, derivedActions: [], forRepId: basics.id, includeCompleted: false }).catch(() => []),
    getPerformance(basics.id, today.start, today.end, null, null).catch(() => null),
    getPerformance(basics.id, week.start, week.end, null, null).catch(() => null),
  ])
  const row = directory?.rows.find((r) => r.repId === basics.id) ?? null
  const base = `/team/${basics.id}`
  const attention = buildRepAttention({ repId: basics.id, row, conversations, tasks, now })
  const t = todayPerf?.totals
  const w = weekPerf?.totals

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5">
        <Section title="Current workload">
          <MetricStrip
            metrics={[
              { label: 'Replies waiting', value: row?.repliesWaiting ?? 0, href: `${base}?tab=conversations&view=waiting_me` },
              { label: 'Follow-ups', value: row?.followUpsOverdue ?? 0, href: `${base}?tab=conversations&view=followups` },
              { label: 'Assigned tasks', value: tasks.length, href: `${base}?tab=tasks` },
              { label: 'High-priority leads', value: row?.highPriority ?? 0, href: `${base}?tab=leads&priority=high` },
            ]}
          />
        </Section>

        <Section title="Attention" description="What is oldest or at risk right now.">
          <ul className="divide-y divide-line/70 rounded-lg border border-line">
            {attention.map((a) => {
              const body = (
                <>
                  <span className="text-[12px] text-stone">{a.label}</span>
                  <span className={a.tone === 'critical' ? 'text-status-danger' : a.tone === 'attention' ? 'text-orange' : 'text-ink'}>
                    {a.detail}
                  </span>
                </>
              )
              return (
                <li key={a.label}>
                  {a.href ? (
                    <Link href={a.href} className="flex flex-col gap-0.5 px-3 py-2 text-[13px] hover:bg-bone-raised sm:flex-row sm:items-center sm:justify-between">
                      {body}
                    </Link>
                  ) : (
                    <div className="flex flex-col gap-0.5 px-3 py-2 text-[13px] sm:flex-row sm:items-center sm:justify-between">{body}</div>
                  )}
                </li>
              )
            })}
          </ul>
        </Section>

        <Section title="Today" description="Executed work since midnight (UTC). Drafts are not counted.">
          <MetricStrip
            metrics={[
              { label: 'Connections', value: t?.connections ?? 0, href: `${base}?tab=activity&range=today&event=CONNECTION_SENT` },
              { label: 'Messages', value: t?.messages ?? 0, href: `${base}?tab=activity&range=today&event=DM_SENT` },
              { label: 'Replies handled', value: t?.repliesSent ?? 0, href: `${base}?tab=activity&range=today&event=REPLY_SENT` },
              { label: 'Applications', value: t?.applications ?? 0, href: `${base}?tab=activity&range=today&event=UPWORK_APPLIED` },
              { label: 'Meetings', value: t?.meetings ?? 0, href: `${base}?tab=activity&range=today&event=MEETING_BOOKED` },
              { label: 'Tasks completed', value: t?.tasksCompleted ?? 0, href: `${base}?tab=activity&range=today&event=TASKS` },
            ]}
          />
        </Section>

        <Section
          title="Weekly progress"
          description="Last 7 days."
          action={<Link href={`${base}?tab=performance`} className="text-[12px] text-graphite hover:text-ink">Performance →</Link>}
        >
          <dl className="grid grid-cols-3 gap-x-4 gap-y-2 rounded-lg border border-line px-3 py-2.5 text-[13px] sm:grid-cols-6">
            {[
              ['Connections', w?.connections],
              ['Messages', w?.messages],
              ['Replies', w?.replies],
              ['Meetings', w?.meetings],
              ['Proposals', w?.proposals],
              ['Wins', w?.wins],
            ].map(([label, value]) => (
              <div key={label as string}>
                <dt className="text-[11px] text-stone">{label}</dt>
                <dd className="tabular-nums text-ink">{value ?? 0}</dd>
              </div>
            ))}
          </dl>
          {row && (
            <div className="mt-2">
              <div className="flex justify-between text-[12px] text-graphite">
                <span>Today&apos;s target</span>
                <span className="tabular-nums">{Math.round(row.targetPct)}%</span>
              </div>
              <div
                className="mt-1 h-1.5 rounded-full bg-bone-raised"
                role="progressbar"
                aria-label="Today's target progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(100, Math.round(row.targetPct))}
              >
                <div className="h-1.5 rounded-full bg-orange/70" style={{ width: `${Math.min(100, Math.round(row.targetPct))}%` }} />
              </div>
            </div>
          )}
        </Section>
      </div>

      <div id="notes" className="scroll-mt-20">
        <NotesPanel subjectType="REP" subjectId={basics.id} title={`Notes about ${basics.name}`} />
      </div>
    </div>
  )
}

async function LeadsTab({ repId, sp, leadScope }: { repId: string; sp: SearchParams; leadScope: 'team' | 'org' | 'profile' }) {
  const query = { ...parseLeadsQuery(sp), owner: repId, scope: leadScope === 'org' ? ('org' as const) : ('team' as const) }
  let data: Awaited<ReturnType<typeof loadLeadsPage>>
  try {
    data = await loadLeadsPage(query)
  } catch (err) {
    return <InlineError>{err instanceof Error ? err.message : 'Leads could not be loaded.'}</InlineError>
  }
  return (
    <LeadsTable
      leads={data.leads}
      total={data.total}
      page={data.page}
      pageSize={data.pageSize}
      pageCount={data.pageCount}
      orgView
      workspaceName={null}
      currentRepId={null}
      reps={data.reps}
      query={query}
      now={Date.now()}
      basePath={`/team/${repId}`}
      fixedParams={{ tab: 'leads' }}
    />
  )
}

async function TasksTab({
  ctx,
  repId,
  reps,
  canAssign,
}: {
  ctx: OpsPageContext
  repId: string
  reps: Array<{ id: string; name: string }>
  canAssign: boolean
}) {
  const now = Date.now()
  const [tasks, conversations] = await Promise.all([
    loadUnifiedTasks({ auth: ctx.auth, derivedActions: [], forRepId: repId, includeCompleted: true }),
    loadConversationRows(ctx.client, { orgId: ctx.auth.orgId, repIds: [repId] }, now).catch(() => []),
  ])
  const counts = countConversationViews(conversations)
  const base = `/team/${repId}`
  return (
    <div className="space-y-4">
      <Section
        title="Derived from sales state"
        description="Work Relay derives from conversations. It clears when the rep acts on the lead — it cannot be reassigned."
      >
        <MetricStrip
          metrics={[
            { label: 'Replies to send', value: counts.waiting_me, href: `${base}?tab=conversations&view=waiting_me` },
            { label: 'Follow-ups due', value: counts.followups, href: `${base}?tab=conversations&view=followups` },
            { label: 'Meetings to prepare', value: counts.meetings, href: `${base}?tab=conversations&view=meetings` },
            { label: 'Assigned overdue', value: countOverdueUnifiedTasks(tasks, now), href: `${base}?tab=tasks&view=overdue` },
          ]}
        />
      </Section>
      <Section title="Assigned tasks" description="Requests from managers and admins. Open a task to start, complete, reassign or reschedule it.">
        <TaskBoard tasks={tasks} reps={reps} canManage={canAssign} currentRepId={ctx.auth.repId} now={now} showGroupBy={false} />
      </Section>
    </div>
  )
}

async function ConversationsTab({ ctx, repId, filters }: { ctx: OpsPageContext; repId: string; filters: Filters }) {
  const now = Date.now()
  const rows = await loadConversationRows(ctx.client, { orgId: ctx.auth.orgId, repIds: [repId] }, now)
  const counts = countConversationViews(rows)
  const view = CONVERSATION_VIEWS.some((v) => v.value === filters.view) ? (filters.view as string) : 'all'
  const base = `/team/${repId}`
  return (
    <div className="space-y-3">
      <LinkTabs
        label="Conversation views"
        active={view}
        tabs={CONVERSATION_VIEWS.map((v) => ({
          value: v.value,
          label: v.label,
          count: counts[v.value],
          href: opsHref(base, { tab: 'conversations' }, { view: v.value === 'all' ? null : v.value }),
        }))}
      />
      <p className="text-[12px] text-graphite">
        Built from conversation state, not message bodies. Open a row to read the actual thread and check how it was handled.
      </p>
      <ConversationTable rows={filterConversationRows(rows, view)} now={now} />
    </div>
  )
}

async function ActivityTab({ ctx, repId, filters }: { ctx: OpsPageContext; repId: string; filters: Filters }) {
  const window = rangeWindow(filters.range)
  const rows = await loadTimeline(ctx.client, {
    orgId: ctx.auth.orgId,
    repIds: [repId],
    start: window.start,
    end: window.end,
    event: filters.event,
    limit: 200,
  }).catch(() => null)
  return (
    <div className="space-y-3">
      <OpsFilters
        basePath={`/team/${repId}`}
        current={{ tab: 'activity', range: filters.range, event: filters.event }}
        filters={[
          { key: 'range', label: 'Date range', options: OPS_RANGES.map((r) => ({ value: r.value, label: r.label })) },
          { key: 'event', label: 'Event type', allLabel: 'All events', options: ACTIVITY_EVENT_FILTERS },
        ]}
      />
      {rows === null ? (
        <InlineError>Activity could not be loaded.</InlineError>
      ) : (
        <TimelineTable rows={rows} now={Date.now()} empty="No operational activity in this window." />
      )}
    </div>
  )
}

async function PerformanceTab({ repId, filters }: { repId: string; filters: Filters }) {
  const window = rangeWindow(filters.range === 'today' ? 'today' : filters.range)
  const perf = await getPerformance(repId, window.start, window.end, filters.profile, filters.source).catch(() => null)
  const base = `/team/${repId}`
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
      <Section title="By sending profile">
        <ProfileComparison rows={perf.byProfile} rangeQuery={`tab=performance&range=${filters.range}`} basePath={base} />
      </Section>
      {perf.truncated && <p className="text-[12px] text-status-warning">This window hit the read limit; totals may be incomplete. Narrow the range.</p>}
    </div>
  )
}
