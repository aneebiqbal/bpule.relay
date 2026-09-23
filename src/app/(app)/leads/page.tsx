import { Suspense, useState } from 'react'
import Link from 'next/link'
import { Plus, Target, Search, MessageSquare } from 'lucide-react'
import { cn } from 'cn'
import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { getAuthContext } from '@/lib/auth/organization'
import { isProductAdmin } from '@/lib/auth/admin-page'
import { StatusBadge } from '@/components/ui/status-badge'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonText, SkeletonCircle } from '@/components/ui/skeleton'
import { LeadsBoard } from '@/components/leads-board'
import type { Lead } from '@/lib/domain/types'

export const dynamic = 'force-dynamic'

type LeadRow = Lead & { ownerName?: string; lastActivityAt?: string | null }
type LeadsPayload = { leads: LeadRow[]; orgView: boolean }

async function loadLeads(): Promise<LeadsPayload> {
  const user = await getCurrentUser()
  const authCtx = await getAuthContext()
  const store = await createScoutStore()
  const orgView = isProductAdmin(user, authCtx)
  const [leads, repsRes, messagesRes] = await Promise.all([
    orgView ? store.fetchLeadsAll() : store.listOwnedLeads(),
    orgView ? store.listAllReps() : Promise.resolve([]),
    // Lightweight last-activity: latest message per lead for the rep's leads.
    // Done via a single bounded query on messages (owner-scoped).
    (async () => {
      try {
        const client = await (await import('@/lib/supabase/server')).createServerSupabase()
        const ids = (orgView ? await store.fetchLeadsAll() : await store.listOwnedLeads()).map((l) => l.id)
        if (!authCtx) return []
        if (ids.length === 0) return []
        const { data } = await client
          .from('messages')
          .select('lead_id, sent_at, created_at')
          .eq('organization_id', authCtx.orgId)
          .in('lead_id', ids)
          .order('sent_at', { ascending: false })
          .limit(1000)
        return data ?? []
      } catch {
        return []
      }
    })(),
  ])

  const reps = Array.isArray(repsRes) ? repsRes : []
  const ownerByRepId = Object.fromEntries(reps.map((rep) => [rep.id, rep.name]))

  const messages = Array.isArray(messagesRes) ? messagesRes : []
  const lastActivityByLead = new Map<string, string>()
  for (const m of messages) {
    const leadId = m.lead_id as string
    const ts = (m.sent_at ?? m.created_at) as string
    if (ts && !lastActivityByLead.has(leadId)) lastActivityByLead.set(leadId, ts)
  }

  const rows: LeadRow[] = leads.map((lead) => ({
    ...lead,
    ownerName: orgView && lead.ownerRepId ? ownerByRepId[lead.ownerRepId] : undefined,
    lastActivityAt: lastActivityByLead.get(lead.id) ?? null,
  }))

  return { leads: rows, orgView }
}

export default function LeadsPage() {
  const leadsPromise = loadLeads()

  return (
    <div className="space-y-5">
      <PageHeader
        title="Leads"
        description="The org pipeline. Work the highest-intent prospects first."
        action={
          <Link
            href="/leads/new"
            className="inline-flex items-center gap-2 rounded-md bg-orange px-3 py-2 text-[13px] font-medium text-on-accent transition-colors hover:bg-orange-dark"
          >
            <Plus className="size-4" aria-hidden="true" />
            New lead
          </Link>
        }
      />

      <Suspense fallback={<LeadsBodySkeleton />}>
        <LeadsBody leadsPromise={leadsPromise} />
      </Suspense>
    </div>
  )
}

async function LeadsBody({ leadsPromise }: { leadsPromise: Promise<LeadsPayload> }) {
  const { leads, orgView } = await leadsPromise

  if (leads.length === 0) {
    return (
      <EmptyState
        icon={Target}
        title="No leads yet"
        description="Paste a LinkedIn profile, add a company, or import from Upwork. Relay scores them and tells you who is worth contacting."
        action={
          <Link
            href="/prospect"
            className="inline-flex items-center gap-2 rounded-md bg-orange px-3 py-2 text-[13px] font-medium text-on-accent transition-colors hover:bg-orange-dark"
          >
            <Search className="size-4" aria-hidden="true" />
            Check a prospect
          </Link>
        }
      />
    )
  }

  // Conversations = leads that have at least one message row (tracked outbound/inbound).
  const conversationIds = new Set<string>()
  for (const l of leads) if (l.lastActivityAt) conversationIds.add(l.id)
  const conversationLeads = leads.filter((l) => conversationIds.has(l.id))

  return (
    <LeadsTabView
      allLeads={leads}
      conversationLeads={conversationLeads}
      orgView={orgView}
    />
  )
}

function LeadsTabView({
  allLeads,
  conversationLeads,
  orgView,
}: {
  allLeads: LeadRow[]
  conversationLeads: LeadRow[]
  orgView: boolean
}) {
  const [tab, setTab] = useState<'pipeline' | 'conversations'>('pipeline')

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-line">
        <button
          type="button"
          onClick={() => setTab('pipeline')}
          className={cn(
            'border-b-2 px-3 py-2 text-[12px] font-medium transition-colors',
            tab === 'pipeline' ? 'border-orange text-ink' : 'border-transparent text-graphite hover:text-ink',
          )}
        >
          Pipeline <span className="ml-1 text-[10px] text-stone">{allLeads.length}</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('conversations')}
          className={cn(
            'border-b-2 px-3 py-2 text-[12px] font-medium transition-colors',
            tab === 'conversations' ? 'border-orange text-ink' : 'border-transparent text-graphite hover:text-ink',
          )}
        >
          Conversations <span className="ml-1 text-[10px] text-stone">{conversationLeads.length}</span>
        </button>
      </div>

      {tab === 'pipeline' ? (
        <LeadsBoard leads={allLeads} orgView={orgView} />
      ) : (
        <ConversationsView leads={conversationLeads} orgView={orgView} />
      )}
    </div>
  )
}

function ConversationsView({ leads, orgView }: { leads: LeadRow[]; orgView: boolean }) {
  if (leads.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line py-8 text-center">
        <p className="text-[13px] text-graphite">No active conversations yet. Once you send a message, the lead appears here.</p>
      </div>
    )
  }
  const sorted = [...leads].sort((a, b) => {
    const aT = a.lastActivityAt ?? a.createdAt
    const bT = b.lastActivityAt ?? b.createdAt
    return new Date(bT).getTime() - new Date(aT).getTime()
  })
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-bone-raised shadow-sm">
      <ul className="divide-y divide-line/60">
        {sorted.map((lead) => (
          <li key={lead.id}>
            <Link href={`/leads/${lead.id}`} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bone sm:px-5">
              <div className="shrink-0">
                <div className="flex size-[36px] items-center justify-center rounded-full border border-line bg-bone">
                  <MessageSquare className="size-4 text-orange" />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[14px] font-medium text-ink">{lead.company}</span>
                  <StatusBadge
                    status={lead.status === 'replied' ? 'Replying' : lead.status === 'contacted' ? 'Contacted' : 'In progress'}
                    variant={lead.status === 'replied' ? 'success' : 'cobalt'}
                  />
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[12px] text-graphite">
                  {lead.contactName && <span className="truncate">{lead.contactName}</span>}
                  {orgView && lead.ownerName && <span className="shrink-0 text-stone">· {lead.ownerName}</span>}
                </div>
              </div>
              <div className="hidden shrink-0 text-right sm:block">
                <p className="text-[11px] text-stone">Last activity</p>
                <p className="text-[11px] text-graphite">{lead.lastActivityAt ? new Date(lead.lastActivityAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function LeadsBodySkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-line bg-bone-raised px-3 py-2.5">
            <SkeletonText className="h-2.5 w-16" />
            <SkeletonText className="mt-2 h-5 w-10" />
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border border-line bg-bone-raised">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-line/60 px-4 py-3 last:border-b-0">
            <SkeletonCircle className="size-[36px]" />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonText className="h-3.5 w-40" />
              <SkeletonText className="h-3 w-28" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
