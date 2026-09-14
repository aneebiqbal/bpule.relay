import Link from 'next/link'
import { Plus, Target, MessageCircle } from 'lucide-react'
import { createScoutStore } from '@/lib/store'
import { signalById } from '@/lib/score/signals'
import { ScoreRing } from '@/components/score-ring'
import { StatusWord } from '@/components/status-word'
import { cn } from 'cn'
import type { Lead } from '@/lib/domain/types'

export const dynamic = 'force-dynamic'

function leadsToGroups(leads: Lead[]) {
  const replies = leads.filter((l) => l.status === 'replied')
  const active = leads.filter((l) => l.status === 'new' || l.status === 'contacted')
  const followedUp = leads.filter((l) => l.status === 'followed_up')
  const closed = leads.filter((l) => l.status === 'no' || l.status === 'dead')
  return { replies, active, followedUp, closed }
}

export default async function LeadsPage() {
  const store = await createScoutStore()
  const leads = await store.listOwnedLeads()
  const { replies, active, followedUp, closed } = leadsToGroups(leads)

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-display text-[28px] text-ink">Leads</h1>
          <p className="text-[14px] text-graphite mt-1">
            {leads.length === 0
              ? 'No leads yet.'
              : `${leads.length} lead${leads.length === 1 ? '' : 's'} · ${replies.length} replying · ${active.length} active`}
          </p>
        </div>
        <Link
          href="/leads/new"
          className="inline-flex items-center gap-2 rounded-lg bg-orange px-4 py-2 text-[13px] font-medium text-bone transition-all hover:bg-orange-dark active:scale-[0.97]"
        >
          <Plus className="size-4" aria-hidden="true" />
          New lead
        </Link>
      </header>

      {leads.length === 0 ? (
        <section className="rounded-lg border border-dashed border-line py-16 text-center">
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
      ) : (
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
      )}
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
      <div className="overflow-hidden rounded-lg border border-line bg-bone-raised">
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
