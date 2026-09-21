import { Suspense } from 'react'
import Link from 'next/link'
import { Plus, Target, Search } from 'lucide-react'
import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { signalById } from '@/lib/score/signals'
import { ScoreRing } from '@/components/score-ring'
import { StatusBadge } from '@/components/ui/status-badge'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonText, SkeletonCircle } from '@/components/ui/skeleton'
import type { Lead } from '@/lib/domain/types'

export const dynamic = 'force-dynamic'

type LeadsPayload = { leads: Lead[]; ownerByRepId: Record<string, string>; orgView: boolean }

async function loadLeads(): Promise<LeadsPayload> {
  const user = await getCurrentUser()
  const store = await createScoutStore()
  const orgView = user?.rep.role === 'admin'
  const [leads, reps] = await Promise.all([
    orgView ? store.fetchLeadsAll() : store.listOwnedLeads(),
    orgView ? store.listAllReps() : Promise.resolve([]),
  ])
  return {
    leads,
    ownerByRepId: Object.fromEntries(reps.map((rep) => [rep.id, rep.name])),
    orgView,
  }
}

const STATUS_VARIANT: Record<string, 'success' | 'orange' | 'warning' | 'neutral' | 'cobalt' | 'danger' | 'info'> = {
  replied: 'success',
  new: 'orange',
  contacted: 'cobalt',
  followed_up: 'warning',
  no: 'neutral',
  dead: 'neutral',
}

const STATUS_LABEL: Record<string, string> = {
  replied: 'Replying',
  new: 'New',
  contacted: 'Contacted',
  followed_up: 'Followed up',
  no: 'Closed',
  dead: 'Closed',
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
            className="inline-flex items-center gap-2 rounded-md bg-orange px-3 py-2 text-[13px] font-medium text-bone transition-colors hover:bg-orange-dark"
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
  const { leads, ownerByRepId, orgView } = await leadsPromise

  if (leads.length === 0) {
    return (
      <EmptyState
        icon={Target}
        title="No leads yet"
        description="Paste a LinkedIn profile, add a company, or import from Upwork. Relay scores them and tells you who is worth contacting."
        action={
          <Link
            href="/prospect"
            className="inline-flex items-center gap-2 rounded-md bg-orange px-3 py-2 text-[13px] font-medium text-bone transition-colors hover:bg-orange-dark"
          >
            <Search className="size-4" aria-hidden="true" />
            Check a prospect
          </Link>
        }
      />
    )
  }

  const sorted = [...leads].sort((a, b) => {
    const aScore = a.canonicalScore ?? a.score ?? 0
    const bScore = b.canonicalScore ?? b.score ?? 0
    if (bScore !== aScore) return bScore - aScore
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-bone-raised shadow-sm">
      <ul className="divide-y divide-line/60">
        {sorted.map((lead) => {
          const signal = signalById(lead.signalType)
          const score = lead.canonicalScore ?? lead.score
          return (
            <li key={lead.id}>
              <Link
                href={`/leads/${lead.id}`}
                className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bone sm:px-5"
              >
                <div className="shrink-0">
                  {score !== null && score !== undefined ? (
                    <ScoreRing score={lead.score} canonicalScore={lead.canonicalScore} size={36} />
                  ) : (
                    <div className="flex size-[36px] items-center justify-center rounded-full border border-dashed border-line">
                      <Target className="size-3.5 text-stone" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-medium text-ink">{lead.company}</span>
                    <StatusBadge
                      status={STATUS_LABEL[lead.status] ?? lead.status}
                      variant={STATUS_VARIANT[lead.status] ?? 'neutral'}
                    />
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[12px] text-graphite">
                    {lead.contactName && <span className="truncate">{lead.contactName}</span>}
                    {orgView && lead.ownerRepId && ownerByRepId[lead.ownerRepId] && (
                      <span className="shrink-0 text-stone">· {ownerByRepId[lead.ownerRepId]}</span>
                    )}
                    {signal && <span className="shrink-0 text-stone">· {signal.short}</span>}
                    {lead.source && <span className="shrink-0 capitalize text-stone">· {lead.source}</span>}
                  </div>
                </div>
                <div className="hidden shrink-0 text-right sm:block">
                  <p className="text-[11px] text-stone">
                    {new Date(lead.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
              </Link>
            </li>
          )
        })}
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
