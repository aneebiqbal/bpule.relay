import { Suspense } from 'react'
import Link from 'next/link'
import { Plus, Target, MessageCircle } from 'lucide-react'
import { createScoutStore } from '@/lib/store'
import { signalById } from '@/lib/score/signals'
import { ScoreRing } from '@/components/score-ring'
import { StatusWord } from '@/components/status-word'
import { cn } from 'cn'
import type { Lead } from '@/lib/domain/types'

export const dynamic = 'force-dynamic'

type LeadsPromise = Promise<Lead[]>

function loadLeads(): LeadsPromise {
  return createScoutStore().then((store) => store.listOwnedLeads())
}

function leadsToGroups(leads: Lead[]) {
  const replies = leads.filter((l) => l.status === 'replied')
  const active = leads.filter((l) => l.status === 'new' || l.status === 'contacted')
  const followedUp = leads.filter((l) => l.status === 'followed_up')
  const closed = leads.filter((l) => l.status === 'no' || l.status === 'dead')
  return { replies, active, followedUp, closed }
}

export default function LeadsPage() {
  const leadsPromise = loadLeads()

  return (
    <div className="space-y-5">
      <header className="srf-console srf-console-edge overflow-hidden px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-orange-light">Pipeline / Lead Lanes</p>
            <h1 className="mt-2 text-[30px] leading-[1.05] tracking-[-0.03em] text-[color:var(--console-text)]">Work the highest-intent leads first.</h1>
            <Suspense fallback={<div className="mt-2 h-4 w-64 max-w-full rounded bg-bone" />}>
              <LeadsSubtitle leadsPromise={leadsPromise} />
            </Suspense>
          </div>
          <Link
            href="/leads/new"
            className="inline-flex items-center gap-2 rounded bg-orange px-4 py-2 text-[13px] font-medium text-bone transition-all hover:bg-orange-dark active:scale-[0.97]"
          >
            <Plus className="size-4" aria-hidden="true" />
            New lead
          </Link>
        </div>
        <Suspense fallback={<LeadMetricsSkeleton />}>
          <LeadMetrics leadsPromise={leadsPromise} />
        </Suspense>
      </header>

      <Suspense fallback={<LeadsBodySkeleton />}>
        <LeadsBody leadsPromise={leadsPromise} />
      </Suspense>
    </div>
  )
}

async function LeadsSubtitle({ leadsPromise }: { leadsPromise: LeadsPromise }) {
  const leads = await leadsPromise
  const { replies, active } = leadsToGroups(leads)
  return (
    <p className="mt-2 text-[13px] text-[color:var(--console-mute)]">
      {leads.length === 0
        ? 'No active leads yet. Start by qualifying your first prospect.'
        : `${leads.length} leads total, ${replies.length} replying, ${active.length} active.`}
    </p>
  )
}

async function LeadMetrics({ leadsPromise }: { leadsPromise: LeadsPromise }) {
  const leads = await leadsPromise
  const { replies, active, followedUp } = leadsToGroups(leads)
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-4">
      <LeadMetric label="Total" value={leads.length} />
      <LeadMetric label="Replying" value={replies.length} />
      <LeadMetric label="In Progress" value={active.length} />
      <LeadMetric label="Followed Up" value={followedUp.length} />
    </div>
  )
}

async function LeadsBody({ leadsPromise }: { leadsPromise: LeadsPromise }) {
  const leads = await leadsPromise
  const { replies, active, followedUp, closed } = leadsToGroups(leads)

  if (leads.length === 0) {
    return (
      <section className="rounded border border-dashed border-line py-16 text-center">
        <div className="mx-auto max-w-sm space-y-3">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-orange/[0.07]">
            <Target className="size-5 text-orange" aria-hidden="true" />
          </div>
          <p className="text-[15px] font-medium text-ink">No leads yet</p>
          <p className="text-[13px] leading-relaxed text-graphite">
            Paste a LinkedIn profile or add a company manually. Relay scores them and tells you who is worth contacting.
          </p>
          <Link
            href="/leads/new"
            className="inline-flex items-center gap-2 rounded-lg bg-orange px-4 py-2 text-[13px] font-medium text-bone transition-all hover:bg-orange-dark"
          >
            <Plus className="size-4" aria-hidden="true" />
            Add your first lead
          </Link>
        </div>
      </section>
    )
  }

  return (
    <div className="space-y-6">
      {replies.length > 0 && (
        <LeadGroup title="Replying" hint="They wrote back" leads={replies} accent="success" />
      )}
      {active.length > 0 && (
        <LeadGroup title="Active" hint="In progress" leads={active} accent="orange" />
      )}
      {followedUp.length > 0 && (
        <LeadGroup title="Followed up" hint="Awaiting reply" leads={followedUp} accent="warning" />
      )}
      {closed.length > 0 && (
        <LeadGroup title="Closed" hint="No or dead" leads={closed} accent="stone" />
      )}
    </div>
  )
}

function LeadMetricsSkeleton() {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="rounded border border-orange/20 bg-orange/5 px-3 py-2">
          <div className="h-2.5 w-16 rounded bg-bone" />
          <div className="mt-2 h-5 w-10 rounded bg-bone" />
        </div>
      ))}
    </div>
  )
}

function LeadsBodySkeleton() {
  return (
    <div className="space-y-6">
      {[0, 1].map((group) => (
        <section key={group} className="space-y-2">
          <div className="h-3 w-24 rounded bg-bone" />
          <div className="overflow-hidden rounded border border-line bg-bone-raised">
            <div className="divide-y divide-line">
              {[0, 1, 2].map((row) => (
                <div key={row} className="flex items-center gap-3 px-4 py-3">
                  <div className="size-[36px] shrink-0 rounded-full bg-bone" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-3.5 w-40 max-w-full rounded bg-bone" />
                    <div className="h-3 w-24 rounded bg-bone" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}
    </div>
  )
}

function LeadGroup({
  title,
  leads,
  accent,
}: {
  title: string
  hint: string
  leads: Lead[]
  accent: 'success' | 'orange' | 'warning' | 'stone'
}) {
  const accentColor = accent === 'success' ? 'text-status-success' : accent === 'orange' ? 'text-orange' : accent === 'warning' ? 'text-status-warning' : 'text-stone'
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="text-label text-stone">{title}</h2>
        <span className={cn('text-mono-medium text-[10px]', accentColor)}>{leads.length}</span>
      </div>
      <div className="overflow-hidden rounded border border-line bg-bone-raised">
        <ul className="divide-y divide-line">
          {leads.map((lead) => {
            const signal = signalById(lead.signalType)
            return (
              <li key={lead.id}>
                <Link
                  href={`/leads/${lead.id}`}
                  className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bone"
                >
                  <div className="shrink-0">
                    {lead.score !== null ? (
                      <ScoreRing score={lead.score} size={36} />
                    ) : (
                      <div className="flex size-[36px] items-center justify-center rounded-full border border-dashed border-line">
                        <Target className="size-3.5 text-stone" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-medium text-ink">{lead.company}</span>
                      <StatusWord status={lead.status} />
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[12px] text-graphite">
                      {lead.contactName && <span>{lead.contactName}</span>}
                      {signal && <span className="text-stone">· {signal.short}</span>}
                    </div>
                  </div>
                  <MessageCircle className="size-3.5 text-stone/40 transition-colors group-hover:text-orange" />
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

function LeadMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-orange/20 bg-orange/5 px-3 py-2">
      <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-orange-light/80">{label}</p>
      <p className="mt-1 text-[20px] font-medium text-[color:var(--console-text)]">{value}</p>
    </div>
  )
}
