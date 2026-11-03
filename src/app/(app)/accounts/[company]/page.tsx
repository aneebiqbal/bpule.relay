import Link from 'next/link'
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import {
  InlineError,
  LinkTabs,
  MetricStrip,
  Section,
  TimelineTable,
  relativeTime,
} from '@/components/operations/ops-primitives'
import { NotesPanel } from '@/components/operations/notes-panel'
import { InterventionMenu } from '@/components/operations/intervention-menu'
import { ConversationTable } from '@/components/operations/conversation-table'
import { TaskBoard } from '@/components/operations/task-board'
import { ComparisonTable } from '@/components/operations/performance-views'
import { assignableReps, requireOpsContext, type OpsPageContext } from '@/lib/operations/page-context'
import { parseOpsFilters } from '@/lib/operations/filters'
import { buildAccountOverview, loadAccountLeads, RELATIONSHIP_LABEL, type AccountLead, type AccountOverview } from '@/lib/operations/accounts'
import { furthestStage } from '@/lib/operations/performance'
import { loadConversationRows } from '@/lib/operations/conversations'
import { loadTimeline } from '@/lib/operations/activity'
import { loadUnifiedTasks } from '@/lib/tasks/load-unified-tasks'

export const dynamic = 'force-dynamic'

const TABS = ['overview', 'people', 'opportunities', 'conversations', 'tasks', 'activity'] as const
type Tab = (typeof TABS)[number]
const TAB_LABEL: Record<Tab, string> = {
  overview: 'Overview',
  people: 'People',
  opportunities: 'Opportunities',
  conversations: 'Conversations',
  tasks: 'Tasks',
  activity: 'Activity',
}

/**
 * Account 360. Visible to anyone with at least one in-scope lead at the
 * company; each viewer sees only their scope's slice of it. Two bounded reads
 * replace the old per-lead message loop on /account.
 */
export default async function Account360Page({
  params,
  searchParams,
}: {
  params: Promise<{ company: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ company }, sp] = await Promise.all([params, searchParams])
  const companyKey = decodeURIComponent(company)
  const ctx = await requireOpsContext()

  const { leads } = await loadAccountLeads(ctx.client, { orgId: ctx.auth.orgId, repIds: ctx.scope.repIds, companyKey })
  const overview = buildAccountOverview(leads)
  if (!overview) notFound()

  const filters = parseOpsFilters(sp)
  const tab: Tab = (TABS as readonly string[]).includes(filters.tab ?? '') ? (filters.tab as Tab) : 'overview'
  const base = `/accounts/${encodeURIComponent(companyKey)}`
  const canAssign = ctx.scope.mode !== 'own'
  const reps = canAssign ? await assignableReps(ctx) : []
  const m = overview.metrics

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {ctx.scope.mode === 'org' && (
            <nav aria-label="Breadcrumb" className="text-[12px] text-stone">
              <Link href="/accounts" className="hover:text-ink">
                Accounts
              </Link>
              <span aria-hidden="true"> / </span>
              <span>{overview.company}</span>
            </nav>
          )}
          <h1 className="mt-1 text-[24px] font-medium tracking-[-0.01em] text-ink">{overview.company}</h1>
          <p className="mt-0.5 text-[13px] text-graphite">
            {[overview.region, overview.sources.join(' · ')].filter(Boolean).join(' · ') || 'No company details yet'}
          </p>
        </div>
        <InterventionMenu
          leadId={overview.potential.leadId}
          reps={reps}
          canAssign={canAssign}
          notesAnchor={tab === 'overview' ? '#notes' : `${base}#notes`}
        />
      </header>

      <MetricStrip
        metrics={[
          { label: 'People', value: m.people, href: `${base}?tab=people` },
          { label: 'Open leads', value: m.openLeads, href: `${base}?tab=opportunities` },
          { label: 'Active conversations', value: m.activeConversations, href: `${base}?tab=conversations` },
          { label: 'Meetings', value: m.meetings, href: `${base}?tab=opportunities` },
          { label: 'Proposals', value: m.proposals, href: `${base}?tab=opportunities` },
          { label: 'Wins', value: m.wins, href: `${base}?tab=opportunities` },
          { label: 'Revenue', value: 'Not tracked', href: null, hint: 'Relay does not store deal value per company yet.' },
        ]}
      />

      <LinkTabs
        label="Account sections"
        active={tab}
        tabs={TABS.map((t) => ({ value: t, label: TAB_LABEL[t], href: t === 'overview' ? base : `${base}?tab=${t}` }))}
      />

      <Suspense key={`${tab}:${JSON.stringify(sp)}`} fallback={<Skeleton className="h-48 w-full rounded-lg" />}>
        {tab === 'overview' && <OverviewTab overview={overview} />}
        {tab === 'people' && <PeopleTab overview={overview} />}
        {tab === 'opportunities' && <OpportunitiesTab leads={leads} />}
        {tab === 'conversations' && <ConversationsTab ctx={ctx} companyKey={companyKey} />}
        {tab === 'tasks' && <TasksTab ctx={ctx} leads={leads} reps={reps} canAssign={canAssign} />}
        {tab === 'activity' && <ActivityTab ctx={ctx} leads={leads} />}
      </Suspense>
    </div>
  )
}

function OverviewTab({ overview }: { overview: AccountOverview }) {
  const now = Date.now()
  const facts: Array<[string, React.ReactNode]> = [
    ['Company summary', `${overview.metrics.people} known ${overview.metrics.people === 1 ? 'person' : 'people'} · ${overview.metrics.openLeads} open`],
    ['Commercial potential', overview.potential.score !== null ? `${overview.potential.label} · ${overview.potential.score}` : overview.potential.label],
    ['Current relationship', overview.relationshipLabel],
    [
      'Best active opportunity',
      overview.potential.leadId ? (
        <Link href={`/leads/${overview.potential.leadId}`} className="underline-offset-2 hover:underline">
          {overview.potential.leadLabel}
        </Link>
      ) : (
        'None'
      ),
    ],
    ['Assigned profiles', overview.profiles.length ? overview.profiles.join(', ') : <span className="text-status-warning">None assigned</span>],
    ['Owners', overview.owners.join(', ') || '—'],
    ['Latest activity', relativeTime(overview.lastActivityAt, now)],
    [
      'Next action',
      overview.nextAction.href ? (
        <Link href={overview.nextAction.href} className="font-medium underline-offset-2 hover:underline">
          {overview.nextAction.label}
        </Link>
      ) : (
        overview.nextAction.label
      ),
    ],
  ]
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Section title="Overview" description="From canonical lead intelligence. Potential uses the existing qualification bands.">
        <dl className="divide-y divide-line/70 rounded-lg border border-line">
          {facts.map(([k, v]) => (
            <div key={k} className="grid grid-cols-1 gap-0.5 px-3 py-2 text-[13px] sm:grid-cols-[180px_1fr]">
              <dt className="text-stone">{k}</dt>
              <dd className="text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>
      <div id="notes" className="scroll-mt-20">
        <NotesPanel subjectType="ACCOUNT" subjectId={overview.companyKey} title="Account notes" />
      </div>
    </div>
  )
}

function PeopleTab({ overview }: { overview: AccountOverview }) {
  const now = Date.now()
  return (
    <ComparisonTable
      caption="Everyone Relay knows at this company"
      rows={overview.people}
      rowKey={(p) => p.leadId}
      empty="No people recorded."
      columns={[
        { key: 'name', header: 'Person', render: (p) => <Link href={`/leads/${p.leadId}`} className="hover:underline">{p.name}</Link> },
        { key: 'title', header: 'Title', render: (p) => <span className="text-graphite">{p.title ?? '—'}</span> },
        { key: 'stage', header: 'Lead stage', render: (p) => p.stageLabel },
        { key: 'profile', header: 'Profile', hideBelow: 'sm', render: (p) => p.profileName ?? <span className="text-status-warning">Not assigned</span> },
        { key: 'owner', header: 'Owner', hideBelow: 'md', render: (p) => p.ownerName ?? '—' },
        { key: 'last', header: 'Last activity', hideBelow: 'md', render: (p) => <span className="tabular-nums text-graphite">{relativeTime(p.lastActivityAt, now)}</span> },
        { key: 'chat', header: 'Conversation', render: (p) => <Link href={`/chats?lead=${p.leadId}`} className="text-graphite hover:text-ink hover:underline">Open</Link> },
      ]}
    />
  )
}

function OpportunitiesTab({ leads }: { leads: AccountLead[] }) {
  const rows = [...leads].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
  return (
    <ComparisonTable
      caption="Opportunities at this company, highest score first"
      rows={rows}
      rowKey={(l) => l.id}
      empty="No opportunities."
      columns={[
        { key: 'lead', header: 'Opportunity', render: (l) => <Link href={`/leads/${l.id}`} className="hover:underline">{l.contactName ?? 'Unnamed contact'}</Link> },
        {
          key: 'stage',
          header: 'Stage',
          render: (l) => {
            const stage = furthestStage({ id: l.id, status: l.status, stage: l.stage, lastSentAt: l.lastSentAt, lastReplyAt: l.lastReplyAt, wonAt: l.wonAt })
            return <StatusBadge status={RELATIONSHIP_LABEL[stage]} variant={stage === 'won' ? 'success' : stage === 'reply' ? 'orange' : 'neutral'} />
          },
        },
        { key: 'score', header: 'Score', numeric: true, render: (l) => l.score ?? '—' },
        { key: 'status', header: 'Status', hideBelow: 'sm', render: (l) => <span className="capitalize text-graphite">{(l.status ?? '—').replace('_', ' ')}</span> },
        { key: 'profile', header: 'Profile', hideBelow: 'md', render: (l) => l.profileName ?? <span className="text-status-warning">Not assigned</span> },
        { key: 'owner', header: 'Owner', hideBelow: 'md', render: (l) => l.ownerName ?? '—' },
        { key: 'chat', header: 'Conversation', render: (l) => <Link href={`/chats?lead=${l.id}`} className="text-graphite hover:text-ink hover:underline">Open</Link> },
      ]}
    />
  )
}

async function ConversationsTab({ ctx, companyKey }: { ctx: OpsPageContext; companyKey: string }) {
  const now = Date.now()
  const rows = await loadConversationRows(ctx.client, { orgId: ctx.auth.orgId, repIds: ctx.scope.repIds, companyKey }, now).catch(() => null)
  if (!rows) return <InlineError>Conversations could not be loaded.</InlineError>
  return <ConversationTable rows={rows} now={now} showOwner />
}

async function TasksTab({
  ctx,
  leads,
  reps,
  canAssign,
}: {
  ctx: OpsPageContext
  leads: AccountLead[]
  reps: Array<{ id: string; name: string }>
  canAssign: boolean
}) {
  const leadIds = new Set(leads.map((l) => l.id))
  const tasks = await loadUnifiedTasks({ auth: ctx.auth, derivedActions: [], includeCompleted: true }).catch(() => null)
  if (!tasks) return <InlineError>Tasks could not be loaded.</InlineError>
  return (
    <TaskBoard
      tasks={tasks.filter((t) => t.leadId && leadIds.has(t.leadId))}
      reps={reps}
      canManage={canAssign}
      currentRepId={ctx.auth.repId}
      now={Date.now()}
    />
  )
}

async function ActivityTab({ ctx, leads }: { ctx: OpsPageContext; leads: AccountLead[] }) {
  const rows = await loadTimeline(ctx.client, {
    orgId: ctx.auth.orgId,
    repIds: null,
    leadIds: leads.map((l) => l.id),
    limit: 200,
  }).catch(() => null)
  if (!rows) return <InlineError>Activity could not be loaded.</InlineError>
  return (
    <div className="space-y-2">
      <p className="text-[12px] text-graphite">One history for the whole company, across every person and profile.</p>
      <TimelineTable rows={rows} now={Date.now()} empty="No activity recorded for this company yet." />
    </div>
  )
}
