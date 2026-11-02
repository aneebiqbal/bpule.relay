import Link from 'next/link'
import { measureLoader } from '@/lib/operations/instrumentation'
import { cache, Suspense } from 'react'
import { ArrowLeft, MessagesSquare } from 'lucide-react'
import { cn } from 'cn'
import { Skeleton } from '@/components/ui/skeleton'
import { LinkTabs, InlineError } from '@/components/operations/ops-primitives'
import { OpsFilters } from '@/components/operations/ops-filters'
import { SavedViewsMenu } from '@/components/operations/saved-views-menu'
import { ChatQueueList } from '@/components/chats/chat-queue-list'
import { ChatIntelligencePanel } from '@/components/chats/chat-intelligence-panel'
import { IntelligenceDrawer } from '@/components/chats/intelligence-drawer'
import { LeadConversation } from '@/components/conversation/lead-conversation'
import { assignableReps, getPeopleDirectory, requireOpsContext, type OpsPageContext } from '@/lib/operations/page-context'
import { effectiveRepIds } from '@/lib/operations/scope'
import { opsHref, parseOpsFilters } from '@/lib/operations/filters'
import { CHAT_VIEWS, loadChatQueue, parseChatView, type ChatQueue } from '@/lib/operations/chat-queue'
import { loadChatIntelligence } from '@/lib/operations/chat-intelligence'
import { getDatabaseCapabilities } from '@/lib/operations/capabilities'
import { resolveActiveWorkspace } from '@/lib/workspace/resolve-active-identity'

export const dynamic = 'force-dynamic'

const AGE_OPTIONS = [
  { value: '1', label: 'Waiting ≥1h' },
  { value: '4', label: 'Waiting ≥4h' },
  { value: '12', label: 'Waiting ≥12h' },
  { value: '24', label: 'Waiting ≥24h' },
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
  const view = parseChatView(filters.view, managerViews)
  const rawStage = Array.isArray(sp.cstage) ? sp.cstage[0] : sp.cstage
  const stageGroup = ['contacted', 'conversation', 'meeting', 'proposal', 'won'].includes(rawStage ?? '') ? rawStage! : null

  const [directory, reps, workspace, profilesRes, capabilities] = await Promise.all([
    managerViews ? getPeopleDirectory().catch(() => null) : Promise.resolve(null),
    managerViews ? assignableReps(ctx) : Promise.resolve([] as Array<{ id: string; name: string }>),
    // Team / org views are never narrowed by the viewer's own sending profile.
    managerViews ? Promise.resolve(null) : resolveActiveWorkspace().catch(() => null),
    ctx.client.from('revenue_identities').select('id, identity_name').eq('organization_id', ctx.auth.orgId).order('identity_name').limit(200),
    getDatabaseCapabilities(ctx.client),
  ])
  const teamMemberIds = filters.team ? directory?.teams.find((t) => t.id === filters.team)?.memberIds ?? [] : null
  const repIds = effectiveRepIds(ctx.scope, { repId: managerViews ? filters.rep : null, teamMemberIds })

  let queue: ChatQueue | null = null
  try {
    queue = await measureLoader('chats.queue', (c) => loadChatQueue(c!, {
      orgId: ctx.auth.orgId,
      repIds,
      workspace: workspace ? { id: workspace.id, profileId: workspace.profileId ?? null } : null,
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
  const hrefFor = (id: string) => opsHref('/chats', current, { lead: id })
  const profiles = (profilesRes.data ?? []) as Array<{ id: string; identity_name: string }>
  const visibleViews = CHAT_VIEWS.filter((v) => !v.managerOnly || managerViews)

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone">Conversations</p>
          <h1 className="text-[22px] font-medium tracking-[-0.01em] text-ink">Inbox</h1>
          <p className="text-[12px] text-graphite">
            {managerViews
              ? ctx.scope.mode === 'org'
                ? 'Every client conversation in the organization, most urgent first.'
                : 'Your team’s client conversations, most urgent first.'
              : workspace
                ? `Your conversations as ${workspace.identityName}, most urgent first.`
                : 'Your client conversations, most urgent first.'}
          </p>
        </div>
      </header>

      <div className={cn(leadId && 'hidden md:block')}>
        <LinkTabs
          label="Conversation views"
          active={view}
          tabs={[
            { value: 'all', label: 'Open', count: queue?.counts.all, href: opsHref('/chats', current, { view: null, lead: null }) },
            ...visibleViews.map((v) => ({
              value: v.value,
              label: v.label,
              count: queue?.counts[v.value],
              href: opsHref('/chats', current, { view: v.value, lead: null }),
            })),
          ]}
        />
        <div className="mt-2">
          <OpsFilters
            basePath="/chats"
            current={current}
            search={{ placeholder: 'Search person or company…' }}
            filters={[
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
            ]}
            trailing={<SavedViewsMenu surface="chats" />}
          />
        </div>
      </div>

      {!queue ? (
        <InlineError>Conversations could not be loaded. Refresh to try again.</InlineError>
      ) : (
        <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(240px,300px)_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_320px]">
          <aside
            aria-label="Conversation queue"
            className={cn('min-w-0 overflow-hidden rounded-lg border border-line bg-bone-raised md:max-h-[calc(100dvh-14rem)] md:overflow-y-auto', leadId && 'hidden md:block')}
          >
            <ChatQueueList
              rows={queue.rows}
              selectedLeadId={leadId}
              hrefFor={hrefFor}
              showOwner={managerViews}
              emptyLabel={view === 'waiting_me' ? 'Nothing is waiting on you.' : 'No conversations in this view.'}
            />
            {queue.total > queue.rows.length && (
              <p className="border-t border-line px-3 py-2 text-[11px] text-stone">
                Showing the {queue.rows.length} most urgent of {queue.total}. Narrow the filters to see others.
              </p>
            )}
            {queue.truncated && (
              <p className="border-t border-line px-3 py-2 text-[11px] text-status-warning">Built from the 1,500 most recent leads in scope.</p>
            )}
          </aside>

          <section aria-label="Thread" className={cn('min-w-0', !leadId && 'hidden md:block')}>
            {leadId ? (
              <Suspense fallback={<Skeleton className="h-[520px] w-full rounded-lg" />}>
                <SelectedThread ctx={ctx} leadId={leadId} reps={reps} backHref={opsHref('/chats', current, { lead: null })} />
              </Suspense>
            ) : (
              <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-lg border border-dashed border-line text-center">
                <MessagesSquare className="size-6 text-stone" aria-hidden="true" />
                <p className="mt-2 text-[13px] text-graphite">Select a conversation to read the thread.</p>
              </div>
            )}
          </section>

          {leadId && (
            <aside aria-label="Lead intelligence pane" className="hidden min-w-0 xl:block xl:max-h-[calc(100dvh-14rem)] xl:overflow-y-auto">
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
  reps,
  backHref,
}: {
  ctx: OpsPageContext
  leadId: string
  reps: Array<{ id: string; name: string }>
  backHref: string
}) {
  const intel = await getIntelligence(leadId)
  if (!intel) {
    return <InlineError>This conversation is not available to you.</InlineError>
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Link href={backHref} scroll={false} className="inline-flex items-center gap-1 text-[12px] text-graphite hover:text-ink md:hidden">
          <ArrowLeft className="size-3.5" aria-hidden="true" /> All conversations
        </Link>
        <IntelligenceDrawer>
          <IntelligenceSlot ctx={ctx} leadId={leadId} reps={reps} />
        </IntelligenceDrawer>
      </div>
      <LeadConversation key={leadId} leadId={leadId} variant="thread" />
    </div>
  )
}

async function IntelligenceSlot({ ctx, leadId, reps }: { ctx: OpsPageContext; leadId: string; reps: Array<{ id: string; name: string }> }) {
  const [intel, capabilities] = await Promise.all([getIntelligence(leadId), getDatabaseCapabilities(ctx.client)])
  if (!intel) return null
  return (
    <ChatIntelligencePanel
      intel={intel}
      reps={reps}
      canIntervene={ctx.scope.mode !== 'own'}
      tasksAvailable={capabilities.assignedTasks}
    />
  )
}
