import Link from 'next/link'
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { Skeleton } from '@/components/ui/skeleton'
import {
  InlineError,
  LinkTabs,
  MetricStrip,
  RepStatusBadge,
  relativeTime,
  Section,
  TimelineTable,
} from '@/components/operations/ops-primitives'
import { V3StageStrip } from '@/components/v3/primitives'
import { OpsFilters } from '@/components/operations/ops-filters'
import { InterventionMenu } from '@/components/operations/intervention-menu'
import { AssignTaskButton } from '@/components/operations/assign-task-button'
import { RequestUpdateButton } from '@/components/operations/request-update-button'
import { NotesPanel } from '@/components/operations/notes-panel'
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
import { getInboxCountsForRepIds } from '@/lib/operations/inbox-counts'
import { loadConversationRows } from '@/lib/operations/conversations'
import { currentInstant, orgDate } from '@/lib/org-clock'
import { ACTIVITY_EVENT_FILTERS, loadTimeline } from '@/lib/operations/activity'
import { loadUnifiedTasks } from '@/lib/tasks/load-unified-tasks'
import { countOverdueUnifiedTasks, isOverdue } from '@/lib/tasks/rank-unified-tasks'
import { loadLeadsPage, parseLeadsQuery } from '@/lib/leads/leads-page'
import { createServerSupabase } from '@/lib/supabase/server'
import { getRepDailyActivity } from '@/lib/performance/activity-model'
import { loadOperatingPolicy } from '@/lib/org-clock/load'
import { ContributionHeatmap } from '@/components/performance/contribution-heatmap'
import { RepAvailabilityControl } from '@/components/team/rep-availability-control'
import { RepOperatingPlanView, type AssignableIdentity } from '@/components/team/rep-operating-plan'
import { loadRepOperatingPlan } from '@/lib/operations/rep-operating-plan'
import { can } from '@/lib/auth/organization'
import { personNameFromProfile } from '@/lib/profiles/person-name'
import { channelLabel, normalizeChannel } from '@/lib/profiles/channel'
import { availabilityLabel } from '@/lib/coverage/load'
import type { AvailabilityState } from '@/lib/coverage/engine'

export const dynamic = 'force-dynamic'

const TABS = ['overview', 'profiles', 'work', 'leads', 'activity', 'performance'] as const
type Tab = (typeof TABS)[number]
const TAB_LABEL: Record<Tab, string> = {
  overview: 'Overview',
  profiles: 'Profiles',
  work: 'Work',
  leads: 'Leads',
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
            Working as{' '}
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
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/chats?rep=${repId}`}
            className="inline-flex h-8 items-center rounded-lg border border-line bg-bone px-2.5 text-[13px] text-ink transition-colors hover:bg-bone-raised"
          >
            Open Inbox
          </Link>
          <Link
            href={`/leads?owner=${repId}`}
            className="inline-flex h-8 items-center rounded-lg border border-line bg-bone px-2.5 text-[13px] text-ink transition-colors hover:bg-bone-raised"
          >
            Open Leads
          </Link>
          {canAssign && <AssignTaskButton reps={reps} defaultAssigneeId={repId} />}
          {canAssign && <RequestUpdateButton reps={reps} defaultAssigneeId={repId} />}
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
        {tab === 'overview' && <OverviewTab ctx={ctx} basics={basics} canAssign={canAssign} />}
        {tab === 'profiles' && <ProfilesTab basics={basics} />}
        {tab === 'leads' && <LeadsTab repId={repId} sp={sp} leadScope={ctx.leadScope} />}
        {tab === 'work' && <WorkTab ctx={ctx} repId={repId} reps={reps} canAssign={canAssign} view={typeof sp.view === 'string' ? sp.view : null} />}
        {tab === 'activity' && <ActivityTab ctx={ctx} repId={repId} filters={filters} />}
        {tab === 'performance' && <PerformanceTab ctx={ctx} repId={repId} filters={filters} />}
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
    <span className="ml-2 inline-flex flex-wrap align-middle items-center gap-2">
      <span className="text-[12px] text-graphite">
        Working today · {row.completedToday} / {row.totalTarget ?? 0} completed
        {row.totalTarget ? ` · ${Math.max(0, row.totalTarget - row.completedToday)} remaining` : ''}
      </span>
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
        { label: 'Replies waiting', value: row?.repliesWaiting ?? '—', href: `/chats?rep=${repId}`, tone: row?.repliesWaiting ? 'attention' : 'default' },
        { label: 'Follow-ups due', value: row?.followUpsOverdue ?? '—', href: `/chats?rep=${repId}` },
        { label: 'Tasks overdue', value: row?.overdueTasks ?? '—', href: `${base}?tab=work&view=overdue`, tone: row?.overdueTasks ? 'critical' : 'default' },
        { label: 'Meetings · 7d', value: perf?.totals.meetings ?? '—', href: `${base}?tab=activity&event=MEETING_BOOKED&range=7d` },
        { label: 'Proposals · 7d', value: perf?.totals.proposals ?? '—', href: `${base}?tab=activity&event=UPWORK_PROPOSAL_PREPARED&range=7d` },
        { label: 'Wins · 7d', value: perf?.totals.wins ?? '—', href: `${base}?tab=activity&event=CLIENT_WON&range=7d` },
        { label: 'Target today', value: row ? `${Math.round(row.targetPct)}%` : '—', href: `/admin/command/${repId}` },
      ]}
    />
  )
}

async function loadAssignableIdentities(ctx: OpsPageContext): Promise<AssignableIdentity[]> {
  const identityRows = await ctx.client
    .from('revenue_identities')
    .select('id, profile_id, identity_name, channel, person_key, status')
    .eq('organization_id', ctx.auth.orgId)
    .eq('status', 'active')
    .limit(500)
  if (identityRows.error) return []
  const rows = (identityRows.data ?? []) as Array<Record<string, unknown>>
  const personKeys = [
    ...new Set(
      rows
        .map((row) => (row.person_key as string | null) ?? (row.profile_id as string | null))
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  const personRows = personKeys.length
    ? await ctx.client
        .from('profiles')
        .select('id, display_name, full_name, label')
        .eq('organization_id', ctx.auth.orgId)
        .in('id', personKeys)
        .limit(200)
    : { data: [] as Array<Record<string, unknown>>, error: null }
  const personNameById = new Map(
    (personRows.data ?? []).map((row) => [row.id as string, personNameFromProfile(row)]),
  )
  return rows.map((row) => {
    const profileId = (row.profile_id as string | null) ?? null
    const personKey = (row.person_key as string | null) ?? profileId ?? (row.id as string)
    return {
      id: row.id as string,
      identityName: (row.identity_name as string) ?? 'Unnamed',
      channel: normalizeChannel(row.channel as string | null),
      profileId,
      personKey,
      personName: personNameById.get(personKey) ?? (row.identity_name as string) ?? 'Unnamed',
      primaryRepId: null,
      primaryRepName: null,
    }
  })
}

async function OverviewTab({
  ctx,
  basics,
  canAssign,
}: {
  ctx: OpsPageContext
  basics: RepBasics
  canAssign: boolean
}) {
  const now = Date.now()
  const today = rangeWindow('today')
  const week = rangeWindow('7d')
  const [directory, conversations, tasks, todayPerf, weekPerf, plan, assignable] = await Promise.all([
    getPeopleDirectory().catch(() => null),
    loadConversationRows(ctx.client, { orgId: ctx.auth.orgId, repIds: [basics.id] }, now).catch(() => []),
    loadUnifiedTasks({ auth: ctx.auth, derivedActions: [], forRepId: basics.id, includeCompleted: false }).catch(() => []),
    getPerformance(basics.id, today.start, today.end, null, null).catch(() => null),
    getPerformance(basics.id, week.start, week.end, null, null).catch(() => null),
    loadRepOperatingPlan(ctx.client, { orgId: ctx.auth.orgId, repId: basics.id, repName: basics.name }).catch(() => null),
    loadAssignableIdentities(ctx).catch(() => []),
  ])
  const row = directory?.rows.find((r) => r.repId === basics.id) ?? null
  const base = `/team/${basics.id}`
  const attention = buildRepAttention({ repId: basics.id, row, conversations, tasks, now })
  const canManage = ctx.auth.isAdmin || ctx.auth.isOwner || can(ctx.auth, 'MANAGE_REVENUE_IDENTITIES')
  const t = todayPerf?.totals
  const w = weekPerf?.totals

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5">
        <Section title="Current workload">
          <MetricStrip
            metrics={[
              { label: 'Replies waiting', value: row?.repliesWaiting ?? 0, href: `/chats?rep=${basics.id}` },
              { label: 'Follow-ups', value: row?.followUpsOverdue ?? 0, href: `/chats?rep=${basics.id}` },
              { label: 'Assigned tasks', value: tasks.length, href: `${base}?tab=work` },
              { label: 'High-priority leads', value: row?.highPriority ?? 0, href: `${base}?tab=leads&priority=high` },
            ]}
          />
        </Section>

        <Section title="Availability" description="Whether this person is operating today.">
          {canAssign ? (
            <RepAvailabilityControl repId={basics.id} initial={(row?.availability as AvailabilityState | null) ?? null} />
          ) : (
            <p className="text-[13px] text-graphite">
              {row?.availability ? availabilityLabel(row.availability as AvailabilityState) : 'No availability recorded'}
            </p>
          )}
        </Section>

        <div id="responsibilities" className="scroll-mt-20">
          <Section title="Responsibilities" description="Who this person works, and what is expected today.">
            {plan ? (
              <RepOperatingPlanView repId={basics.id} plan={plan} identities={assignable} canManage={canManage} />
            ) : (
              <p className="text-[13px] text-graphite">The operating plan could not be loaded.</p>
            )}
          </Section>
        </div>

        <Section title="Attention" description="What is oldest or at risk right now.">
          <ul className="divide-y divide-line/70 rounded-lg border border-line">
            {attention.map((a) => {
              const body = (
                <>
                  <span className="text-[12px] text-stone">{a.label}</span>
                  <span className={a.tone === 'critical' ? 'text-status-danger' : a.tone === 'attention' ? 'text-orange-ink' : 'text-ink'}>
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

        <Section title="Today" description="Executed work since the operating day reset. Drafts are not counted.">
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

function ProfilesTab({ basics }: { basics: RepBasics }) {
  return (
    <Section title="Profiles" description="The channels this person operates.">
      {basics.identities.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-4 text-[13px] text-graphite">
          No profiles assigned yet.
        </p>
      ) : (
        <ul className="divide-y divide-line/70 overflow-hidden rounded-lg border border-line">
          {basics.identities.map((identity) => (
            <li key={identity.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-ink">{identity.name}</p>
                <p className="text-[11px] text-stone">{identity.channel ? channelLabel(identity.channel) : 'Channel unknown'}</p>
              </div>
              {identity.profileId && (
                <Link
                  href={`/team/profiles/${identity.profileId}`}
                  className="inline-flex min-h-11 shrink-0 items-center rounded-md border border-line px-2.5 py-1.5 text-[12px] font-medium text-graphite transition-colors hover:text-ink"
                >
                  Open profile
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
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

async function WorkTab({
  ctx,
  repId,
  reps,
  canAssign,
  view,
}: {
  ctx: OpsPageContext
  repId: string
  reps: Array<{ id: string; name: string }>
  canAssign: boolean
  /** ?view=overdue filters the board to overdue assigned work. */
  view: string | null
}) {
  const now = Date.now()
  const [tasks, inbox] = await Promise.all([
    loadUnifiedTasks({ auth: ctx.auth, derivedActions: [], forRepId: repId, includeCompleted: true }),
    getInboxCountsForRepIds(ctx.client, {
      orgId: ctx.auth.orgId,
      repIds: [repId],
      businessDate: orgDate(currentInstant(), await loadOperatingPolicy(ctx.auth.orgId).then((p) => p.timezone).catch(() => 'UTC')),
    }).catch(() => new Map<string, { needsReply: number; waitingOnClient: number; followups: number }>()),
  ])
  // The "Assigned overdue" metric deep-links here; honour it instead of ignoring it.
  const visibleTasks = view === 'overdue' ? tasks.filter((task) => isOverdue(task, now)) : tasks
  const repInbox = inbox.get(repId)
  const base = `/team/${repId}`
  return (
    <div className="space-y-4">
      <Section
        title="Derived from sales state"
        description="Work Relay derives from conversations. It clears when the rep acts on the lead — it cannot be reassigned."
      >
        <MetricStrip
          metrics={[
            { label: 'Replies to send', value: repInbox?.needsReply ?? 0, href: `/chats?rep=${repId}&view=waiting_me` },
            { label: 'Waiting on clients', value: repInbox?.waitingOnClient ?? 0, href: `/chats?rep=${repId}&view=waiting_them` },
            { label: 'Follow-ups due', value: repInbox?.followups ?? 0, href: `/chats?rep=${repId}&view=followups` },
            { label: 'Assigned overdue', value: countOverdueUnifiedTasks(tasks, now), href: `${base}?tab=work&view=overdue` },
          ]}
        />
      </Section>
      <Section
        title="Assigned tasks"
        description="Requests from managers and admins. Open a task to start, complete, reassign or reschedule it."
        action={<Link href="/tasks?view=all" className="text-[12px] text-graphite hover:text-ink">All tasks →</Link>}
      >
        <TaskBoard tasks={visibleTasks} reps={reps} canManage={canAssign} currentRepId={ctx.auth.repId} now={now} showGroupBy={false} />
      </Section>
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

async function PerformanceTab({ ctx, repId, filters }: { ctx: OpsPageContext; repId: string; filters: Filters }) {
  const window = rangeWindow(filters.range === 'today' ? 'today' : filters.range)
  const perf = await getPerformance(repId, window.start, window.end, filters.profile, filters.source).catch(() => null)
  const base = `/team/${repId}`
  if (!perf) return <InlineError>Performance could not be loaded.</InlineError>
  const activityHref = (event: string | null) => opsHref(base, { tab: 'activity', range: filters.range }, { event })
  const timezone = await loadOperatingPolicy(ctx.auth.orgId).then((p) => p.timezone).catch(() => 'UTC')
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  const start = new Date()
  start.setDate(start.getDate() - 84)
  start.setHours(0, 0, 0, 0)
  const activity = await getRepDailyActivity({
    repId,
    orgId: ctx.auth.orgId,
    startDate: start,
    endDate: end,
    timezone,
    supabase: await createServerSupabase(),
    includeEventsForDate: null,
  }).catch(() => null)
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
      {activity && (
        <Section title="Consistency" description="Daily executed activity, last 12 weeks. Drafts and failures never count.">
          <ContributionHeatmap daily={activity.daily} timezone={timezone} dayHref={`${base}?tab=performance&range=${filters.range}`} />
        </Section>
      )}
      {perf.truncated && <p className="text-[12px] text-status-warning">This window hit the read limit; totals may be incomplete. Narrow the range.</p>}
    </div>
  )
}
