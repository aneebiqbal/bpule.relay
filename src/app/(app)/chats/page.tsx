import Link from 'next/link'
import { measureLoader } from '@/lib/operations/instrumentation'
import { cache, Suspense } from 'react'
import { ArrowLeft, MessagesSquare } from 'lucide-react'
import { cn } from 'cn'
import { Skeleton } from '@/components/ui/skeleton'
import { LinkTabs, InlineError } from '@/components/operations/ops-primitives'
import { ChatQueueList } from '@/components/chats/chat-queue-list'
import { ChatFilters, type ChatCondition, type ChatFilterDef } from '@/components/chats/chat-filters'
import { ThreadHeader } from '@/components/chats/thread-header'
import { AutoSelectConversation } from '@/components/chats/auto-select-conversation'
import { INBOX_PRIMARY_VIEWS, INBOX_SECONDARY_CONDITIONS, inboxDefaultView } from '@/lib/navigation/inbox-nav'
import { ChatIntelligencePanel } from '@/components/chats/chat-intelligence-panel'
import { IntelligenceDrawer } from '@/components/chats/intelligence-drawer'
import { LeadConversation } from '@/components/conversation/lead-conversation'
import { assignableReps, getPeopleDirectory, requireOpsContext, type OpsPageContext } from '@/lib/operations/page-context'
import { effectiveRepIds } from '@/lib/operations/scope'
import { opsHref, parseOpsFilters } from '@/lib/operations/filters'
import { loadChatQueue, parseChatView, type ChatQueue, type ChatView } from '@/lib/operations/chat-queue'
import { loadChatIntelligence } from '@/lib/operations/chat-intelligence'
import { getDatabaseCapabilities } from '@/lib/operations/capabilities'
import { getAuthorizedIdentities } from '@/lib/auth/workspace'

export const dynamic = 'force-dynamic'

const AGE_OPTIONS = [
  { value: '1', label: 'Waiting ≥1h' },
  { value: '4', label: 'Waiting ≥4h' },
  { value: '12', label: 'Waiting ≥12h' },
  { value: '24', label: 'Waiting ≥24h' },
]

const STAGE_OPTIONS = [
  { value: 'contacted', label: 'Contacted' },
  { value: 'conversation', label: 'Conversation' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'won', label: 'Won' },
]

const UUIDISH = /^[0-9a-f-]{36}$/i

/** One intelligence load per request even though the panel renders twice (pane + drawer). */
const getIntelligence = cache(async (leadId: string) => {
  const ctx = await requireOpsContext()
  const capabilities = await getDatabaseCapabilities(ctx.client)
  return measureLoader('chats.intelligence', (c) => loadChatIntelligence(c!, ctx.auth, ctx.scope, leadId, { tasks: capabilities.assignedTasks }), ctx.client)
})

/**
 * Conversations — the client-response workspace.
 *   ≥1280px  queue | thread | intelligence
 *   768–1279 queue | thread, intelligence in a drawer
 *   <768     queue → thread (back link) → intelligence drawer
 * Reps see their own queue for the active sending profile; managers their
 * team; admins the organization — all from server-side operational scope.
 */
export default async function ChatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireOpsContext()
  const sp = await searchParams
  const filters = parseOpsFilters(sp)
  const rawLead = Array.isArray(sp.lead) ? sp.lead[0] : sp.lead
  const leadId = rawLead && UUIDISH.test(rawLead) ? rawLead : null
  const rawAge = Array.isArray(sp.age) ? sp.age[0] : sp.age
  const minAgeHours = AGE_OPTIONS.some((o) => o.value === rawAge) ? Number(rawAge) : null
  const managerViews = ctx.scope.mode !== 'own'
  // Reps open on the work that needs them; managers open on the whole queue.
  const view: ChatView = filters.view ? parseChatView(filters.view, managerViews) : inboxDefaultView(managerViews)
  const rawStage = Array.isArray(sp.cstage) ? sp.cstage[0] : sp.cstage
  const stageGroup = ['contacted', 'conversation', 'meeting', 'proposal', 'won'].includes(rawStage ?? '') ? rawStage! : null

  const [directory, reps, executableIdentities, profilesRes, capabilities] = await Promise.all([
    managerViews ? getPeopleDirectory().catch(() => null) : Promise.resolve(null),
    managerViews ? assignableReps(ctx) : Promise.resolve([] as Array<{ id: string; name: string }>),
    // Reps work every executable profile (primary + active coverage), so the
    // queue and its counts stay parity with Rep Home. Team / org views are
    // never narrowed by the viewer's own sending profile.
    managerViews ? Promise.resolve(null) : getAuthorizedIdentities().catch(() => null),
    ctx.client.from('revenue_identities').select('id, identity_name').eq('organization_id', ctx.auth.orgId).order('identity_name').limit(200),
    getDatabaseCapabilities(ctx.client),
  ])
  const teamMemberIds = filters.team ? directory?.teams.find((t) => t.id === filters.team)?.memberIds ?? [] : null
  // Admins (ctx.scope.mode === 'org') get the whole organization; managers get
  // their team; reps get their own queue. Scope is never narrowed client-side.
  const repIds = effectiveRepIds(ctx.scope, { repId: managerViews ? filters.rep : null, teamMemberIds })

  let queue: ChatQueue | null = null
  try {
    queue = await measureLoader('chats.queue', (c) => loadChatQueue(c!, {
      orgId: ctx.auth.orgId,
      repIds,
      executableIdentities: executableIdentities
        ? executableIdentities.map((identity) => ({ id: identity.revenueIdentityId, profileId: identity.profileId }))
        : null,
      coveredIdentityIds: executableIdentities
        ? executableIdentities.filter((identity) => identity.access === 'coverage').map((identity) => identity.revenueIdentityId)
        : null,
      profileId: filters.profile,
      source: filters.source,
      q: filters.q,
      view,
      managerViews,
      minAgeHours,
      stageGroup,
      previewView: capabilities.messagePreviews,
    }), ctx.client)
  } catch (err) {
    console.error('chat queue failed:', err)
  }

  const current = {
    view: view === 'all' ? null : view,
    rep: filters.rep,
    team: filters.team,
    profile: filters.profile,
    source: filters.source,
    q: filters.q,
    age: minAgeHours ? String(minAgeHours) : null,
    cstage: stageGroup,
  }
  // Links keep the explicit All view so opening a conversation from All does
  // not snap the queue back to the rep default.
  const linkState = { ...current, view: view === 'all' ? 'all' : current.view }
  const hasFilters = Boolean(filters.q || filters.profile || filters.source || minAgeHours || filters.rep || filters.team || stageGroup)
  // The queue aggregates every executable profile; say so before the counts.
  const inboxScopeLabel = executableIdentities
    ? executableIdentities.length > 1
      ? 'All your active profiles'
      : (executableIdentities[0]?.identityName ?? 'Your active profile')
    : managerViews
      ? (ctx.scope.mode === 'org' ? 'All organization profiles' : 'Your team')
      : 'Your active profile'
  const queueEmptyLabel =
    view === 'waiting_me'
      ? 'You’re caught up. No client replies need attention.'
      : view === 'closed'
        ? 'No closed conversations in this view.'
        : hasFilters
          ? 'No conversations match these filters.'
          : 'No conversations in this view.'
  const hrefFor = (id: string) => opsHref('/chats', linkState, { lead: id })
  const profiles = (profilesRes.data ?? []) as Array<{ id: string; identity_name: string }>
  const selectedRow = queue?.rows.find((r) => r.leadId === leadId) ?? null

  const filterDefs: ChatFilterDef[] = [
    ...(managerViews && directory && directory.teams.length > 0
      ? [{ key: 'team', label: 'Team', allLabel: 'All teams', options: directory.teams.map((t) => ({ value: t.id, label: t.name })) }]
      : []),
    ...(managerViews ? [{ key: 'rep', label: 'Rep', allLabel: 'All reps', options: reps.map((r) => ({ value: r.id, label: r.name })) }] : []),
    { key: 'profile', label: 'Profile', allLabel: 'All profiles', options: profiles.map((p) => ({ value: p.id, label: p.identity_name })) },
    {
      key: 'source',
      label: 'Source',
      allLabel: 'All sources',
      options: [
        { value: 'linkedin', label: 'LinkedIn' },
        { value: 'upwork', label: 'Upwork' },
        { value: 'other', label: 'Other' },
      ],
    },
    { key: 'age', label: 'Age', allLabel: 'Any age', options: AGE_OPTIONS },
    { key: 'cstage', label: 'Stage', allLabel: 'Any stage', options: STAGE_OPTIONS },
  ]
  const conditions: ChatCondition[] = INBOX_SECONDARY_CONDITIONS.filter(
    (v) => managerViews || !v.managerOnly,
  ).map((v) => ({ value: v.value, label: v.label }))
  const primaryTabs = INBOX_PRIMARY_VIEWS.map((v) => ({
    value: v.value,
    label: v.label,
    count: queue?.counts[v.value],
    href: opsHref('/chats', linkState, { view: v.value, lead: null }),
  }))

  return (
    <div className="flex flex-col gap-3 md:h-[calc(100dvh-13rem)] lg:h-[calc(100dvh-7rem)]">
      <AutoSelectConversation
        leadId={leadId}
        firstHref={queue?.rows[0] ? hrefFor(queue.rows[0].leadId) : null}
        defaultView={inboxDefaultView(managerViews)}
      />

      {!queue ? (
        <div className="grid min-w-0 flex-1 gap-3 min-h-0 md:grid-cols-[minmax(240px,300px)_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_320px]">
          <aside aria-label="Conversation queue" className="min-h-0 min-w-0 overflow-y-auto rounded-lg border border-line bg-bone-raised">
            <div className="p-3">
              <p role="alert" className="rounded-lg border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-[13px] text-status-danger">
                Couldn’t load conversations. Refresh to try again.
              </p>
            </div>
          </aside>
          <section aria-label="Thread" tabIndex={0} className="min-h-0 min-w-0 overflow-y-auto rounded-lg border border-dashed border-line">
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center p-6 text-center">
              <MessagesSquare className="size-6 text-stone" aria-hidden="true" />
              <p className="mt-2 text-[13px] text-graphite">Select a conversation to read the thread.</p>
            </div>
          </section>
        </div>
      ) : (
        <div className="grid min-w-0 flex-1 gap-3 min-h-0 md:grid-cols-[minmax(240px,300px)_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_320px]">
          <aside
            aria-label="Conversation queue"
            className={cn(
              'min-h-0 min-w-0 flex flex-col overflow-hidden rounded-lg border border-line bg-bone-raised h-[calc(100dvh-14rem)] md:h-auto',
              leadId && 'hidden md:block',
            )}
          >
            <div className="flex shrink-0 flex-col gap-2 border-b border-line p-3">
              <div className="flex items-baseline justify-between gap-2">
                <h1 className="text-[16px] font-medium tracking-[-0.01em] text-ink">Inbox</h1>
                <span className="text-[12px] text-graphite">
                  {queue.counts.waiting_me ?? 0} need reply
                </span>
              </div>
              <p className="text-[11px] text-stone">{inboxScopeLabel}</p>
              <ChatFilters
                basePath="/chats"
                current={current}
                activeView={view}
                filters={filterDefs}
                conditions={conditions}
                managerViews={managerViews}
              />
              <LinkTabs label="Conversation views" active={view} tabs={primaryTabs} compact />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ChatQueueList
                rows={queue.rows}
                selectedLeadId={leadId}
                hrefFor={hrefFor}
                showOwner={managerViews}
                emptyLabel={queueEmptyLabel}
              />
              {!leadId && queue.rows.length === 0 && view === 'waiting_me' && (
                <div className="border-t border-line px-3 py-2">
                  <Link
                    href={opsHref('/chats', linkState, { view: 'all', lead: null })}
                    scroll={false}
                    className="text-[12px] font-medium text-[#9e4517] hover:underline"
                  >
                    View all conversations
                  </Link>
                </div>
              )}
              {!leadId && queue.rows.length === 0 && hasFilters && view !== 'waiting_me' && (
                <div className="border-t border-line px-3 py-2">
                  <Link
                    href={opsHref('/chats', { view: null, rep: null, team: null, profile: null, source: null, q: null, age: null, cstage: null, lead: null })}
                    scroll={false}
                    className="text-[12px] font-medium text-[#9e4517] hover:underline"
                  >
                    Clear filters
                  </Link>
                </div>
              )}
              {queue.total > queue.rows.length && (
                <p className="border-t border-line px-3 py-2 text-[11px] text-stone">
                  Showing the {queue.rows.length} most urgent of {queue.total}. Narrow the filters to see others.
                </p>
              )}
              {queue.truncated && (
                <p className="border-t border-line px-3 py-2 text-[11px] text-status-warning">Built from the 1,500 most recent leads in scope.</p>
              )}
            </div>
          </aside>

          <section
            aria-label="Thread"
            tabIndex={0}
            className={cn(
              'min-h-0 min-w-0 flex flex-col overflow-hidden h-[calc(100dvh-14rem)] md:h-auto',
              !leadId && 'hidden md:block',
            )}
          >
            {leadId ? (
              <Suspense fallback={<Skeleton className="h-[420px] w-full rounded-lg" />}>
                <SelectedThread
                  ctx={ctx}
                  leadId={leadId}
                  row={selectedRow}
                  reps={reps}
                  backHref={opsHref('/chats', linkState, { lead: null })}
                  tasksAvailable={capabilities.assignedTasks}
                />
              </Suspense>
            ) : (
              <div className="flex h-full min-h-[240px] flex-col items-center justify-center rounded-lg border border-dashed border-line text-center">
                <MessagesSquare className="size-6 text-stone" aria-hidden="true" />
                <p className="mt-2 text-[13px] text-graphite">Select a conversation to start.</p>
              </div>
            )}
          </section>

          {leadId && (
            <aside aria-label="Lead intelligence pane" className="hidden min-h-0 min-w-0 overflow-y-auto rounded-lg border border-line bg-bone-raised xl:block">
              <Suspense fallback={<Skeleton className="h-64 w-full rounded-lg" />}>
                <IntelligenceSlot ctx={ctx} leadId={leadId} reps={reps} />
              </Suspense>
            </aside>
          )}
        </div>
      )}
    </div>
  )
}

async function SelectedThread({
  ctx,
  leadId,
  row,
  reps,
  backHref,
  tasksAvailable,
}: {
  ctx: OpsPageContext
  leadId: string
  row: ChatQueue['rows'][number] | null
  reps: Array<{ id: string; name: string }>
  backHref: string
  tasksAvailable: boolean
}) {
  const intel = await getIntelligence(leadId)
  // A lead that is not in the queue and has no intelligence is out of scope.
  // A lead that IS in the queue but failed to load context still opens: the
  // thread must never be taken down by the intelligence pane.
  if (!intel && !row) {
    return <InlineError>This conversation is not available to you.</InlineError>
  }
  const headerRow =
    row ?? {
      leadId: intel!.leadId,
      person: intel!.person,
      title: intel!.title,
      company: intel!.company,
      companyKey: intel!.companyKey,
      ownerRepId: intel!.ownerRepId,
      ownerName: intel!.ownerName,
      profileName: intel!.profileName,
      state: intel!.conversation?.state ?? 'waiting_on_prospect',
      stageLabel: intel!.conversation?.stageLabel ?? null,
      lastInboundAt: intel!.conversation?.lastInboundAt ?? null,
      lastOutboundAt: intel!.conversation?.lastOutboundAt ?? null,
      waitingOn: intel!.conversation?.waitingOn ?? null,
      ageHours: intel!.conversation?.ageHours ?? null,
      nextAction: intel!.conversation?.nextAction ?? 'Reply',
      href: `/chats?lead=${intel!.leadId}`,
      source: 'linkedin' as const,
      sourceRaw: intel!.sourceRaw,
      direction: intel!.direction,
      profileId: intel!.profileId,
      clientIntent: intel!.lastClientIntent,
      preview: null,
      previewFrom: null,
      needsReview: false,
      unassigned: !intel!.ownerRepId,
      priority: 'normal' as const,
    }
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <Link href={backHref} scroll={false} className="inline-flex items-center gap-1 text-[12px] text-graphite hover:text-ink md:hidden">
        <ArrowLeft className="size-3.5" aria-hidden="true" /> All conversations
      </Link>
      <ThreadHeader
        row={headerRow}
        reps={reps}
        canIntervene={ctx.scope.mode !== 'own'}
        tasksAvailable={tasksAvailable}
        leadCreatedAt={intel?.leadCreatedAt ?? null}
        contextAction={
          <div className="xl:hidden">
            <IntelligenceDrawer>
              <IntelligenceSlot ctx={ctx} leadId={leadId} reps={reps} />
            </IntelligenceDrawer>
          </div>
        }
      />
      <LeadConversation key={leadId} leadId={leadId} variant="thread" sendingProfile={intel?.profileName ?? headerRow.profileName} />
    </div>
  )
}

async function IntelligenceSlot({ ctx, leadId, reps }: { ctx: OpsPageContext; leadId: string; reps: Array<{ id: string; name: string }> }) {
  const now = Date.now()
  const [intel, capabilities] = await Promise.all([getIntelligence(leadId), getDatabaseCapabilities(ctx.client)])
  if (!intel) {
    // A failed context pane must never take the thread down with it.
    return (
      <p role="alert" className="rounded-lg border border-status-warning/30 bg-status-warning/5 px-3 py-2 text-[13px] text-graphite">
        Lead context could not be loaded. The conversation is still available.
      </p>
    )
  }
  return (
    <ChatIntelligencePanel
      intel={intel}
      reps={reps}
      canIntervene={ctx.scope.mode !== 'own'}
      tasksAvailable={capabilities.assignedTasks}
      now={now}
    />
  )
}
