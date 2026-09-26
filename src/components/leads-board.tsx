'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, MessageSquare, Target, Lock } from 'lucide-react'
import { cn } from 'cn'
import { StatusBadge } from '@/components/ui/status-badge'
import { ScoreRing } from '@/components/score-ring'
import { signalById } from '@/lib/score/signals'
import { isLeadLocked, lockCountdownMs } from '@/lib/leads/lock'
import { LogReplyDialog } from '@/components/log-reply-dialog'
import type { Lead } from '@/lib/domain/types'

type LeadRow = Lead & { ownerName?: string; lastActivityAt?: string | null }

const STATUS_VARIANT: Record<string, 'success' | 'orange' | 'warning' | 'neutral' | 'cobalt' | 'danger' | 'info'> = {
  replied: 'success',
  new: 'neutral',
  contacted: 'cobalt',
  followed_up: 'warning',
  won: 'success',
  lost: 'neutral',
  no: 'neutral',
  dead: 'neutral',
}

const STATUS_LABEL: Record<string, string> = {
  replied: 'Replying',
  new: 'New',
  contacted: 'Contacted',
  followed_up: 'Followed up',
  won: 'Won',
  lost: 'Lost',
  no: 'Closed',
  dead: 'Closed',
}

type FilterKey = 'all' | 'new' | 'contacted' | 'awaiting_connection' | 'replied' | 'followup_due' | 'won' | 'lost' | 'locked'

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'awaiting_connection', label: 'Awaiting connection' },
  { key: 'replied', label: 'Replying' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'followup_due', label: 'Follow-up due' },
  { key: 'locked', label: 'Locked' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
]

type SortKey = 'score' | 'recent' | 'activity'

function relativeNow(iso: string | null | undefined, now: number): string {
  if (!iso) return '—'
  const diff = now - new Date(iso).getTime()
  if (diff < 60_000) return 'just now'
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function LeadsBoard({ leads, orgView }: { leads: LeadRow[]; orgView: boolean }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [sort, setSort] = useState<SortKey>('score')
  const [replyLead, setReplyLead] = useState<LeadRow | null>(null)
  const [now, setNow] = useState(() => Date.now())

  // Tick every 30s for live "Xm ago" timestamps
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let rows = leads.filter((lead) => {
      if (q) {
        const hay = [lead.company, lead.contactName ?? '', lead.signalEvidence ?? '', lead.companyKey].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      const locked = isLeadLocked(lead.lockedUntil ?? null, now)
      switch (filter) {
        case 'all': return true
        case 'new': return lead.status === 'new'
        case 'awaiting_connection': return lead.status === 'contacted' && !lead.connectionAcceptedAt && lead.lockedReason === 'connection_note_sent' && !locked
        case 'replied': return lead.status === 'replied'
        case 'contacted': return lead.status === 'contacted'
        case 'followup_due': return lead.status === 'followed_up'
        case 'won': return lead.status === 'won'
        case 'lost': return lead.status === 'lost'
        case 'locked': return locked
        default: return true
      }
    })

    rows = [...rows].sort((a, b) => {
      if (sort === 'recent') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      if (sort === 'activity') {
        const aT = a.lastActivityAt ?? a.createdAt
        const bT = b.lastActivityAt ?? b.createdAt
        return new Date(bT).getTime() - new Date(aT).getTime()
      }
      const aScore = a.canonicalScore ?? a.score ?? 0
      const bScore = b.canonicalScore ?? b.score ?? 0
      if (bScore !== aScore) return bScore - aScore
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
    return rows
  }, [leads, search, filter, sort, now])

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { all: leads.length, new: 0, awaiting_connection: 0, replied: 0, contacted: 0, followup_due: 0, won: 0, lost: 0, locked: 0 }
    for (const lead of leads) {
      const locked = isLeadLocked(lead.lockedUntil ?? null, now)
      if (lead.status === 'new') c.new++
      if (lead.status === 'contacted') c.contacted++
      if (lead.status === 'replied') c.replied++
      if (lead.status === 'followed_up') c.followup_due++
      if (lead.status === 'won') c.won++
      if (lead.status === 'lost') c.lost++
      if (lead.status === 'contacted' && !lead.connectionAcceptedAt && lead.lockedReason === 'connection_note_sent' && !locked) c.awaiting_connection++
      if (locked) c.locked++
    }
    return c
  }, [leads, now])

  return (
    <div className="space-y-3">
      {/* Search + sort */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-stone" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company, contact, signal..."
            className="w-full rounded-md border border-line bg-bone py-1.5 pl-8 pr-3 text-[13px] text-ink placeholder:text-stone focus:border-orange focus:outline-none"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-md border border-line bg-bone px-2 py-1.5 text-[12px] text-ink focus:border-orange focus:outline-none"
        >
          <option value="score">Highest score</option>
          <option value="recent">Newest first</option>
          <option value="activity">Last activity</option>
        </select>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
              filter === f.key ? 'bg-solid text-on-solid' : 'border border-line text-graphite hover:bg-bone-raised',
            )}
          >
            {f.label}
            <span className="ml-1 text-[10px] opacity-70">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line px-6 py-10 text-center">
          <p className="text-[14px] font-medium text-ink">
            {search ? 'No leads match your search.' : 'No leads yet.'}
          </p>
          <p className="mt-1 text-[13px] text-graphite">
            {search ? 'Try a different search term.' : 'Find prospects and save them to start your outreach.'}
          </p>
          {!search && (
            <Link
              href="/prospect"
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-orange px-4 py-2 text-[13px] font-medium text-on-accent transition-colors hover:bg-orange-dark"
            >
              <Search className="size-3.5" />
              Find prospects
            </Link>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-bone-raised shadow-sm">
          <ul className="divide-y divide-line/60">
            {filtered.map((lead) => {
              const signal = signalById(lead.signalType)
              const score = lead.canonicalScore ?? lead.score
              const locked = isLeadLocked(lead.lockedUntil ?? null, now)
              const countdown = lockCountdownMs(lead.lockedUntil ?? null, now)
              const mins = Math.max(0, Math.round(countdown / 60_000))
              const lastActivity = lead.lastActivityAt ?? lead.createdAt
              return (
                <li key={lead.id}>
                  <div className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-bone sm:px-5">
                    <div className="shrink-0">
                      {score !== null && score !== undefined ? (
                        <ScoreRing score={lead.score} canonicalScore={lead.canonicalScore} size={36} />
                      ) : (
                        <div className="flex size-[36px] items-center justify-center rounded-full border border-dashed border-line">
                          <Target className="size-3.5 text-stone" />
                        </div>
                      )}
                    </div>
                    <Link href={`/leads/${lead.id}`} className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-medium text-ink">{lead.company}</span>
                        <StatusBadge
                          status={STATUS_LABEL[lead.status] ?? lead.status}
                          variant={STATUS_VARIANT[lead.status] ?? 'neutral'}
                        />
                        {locked && (
                          <StatusBadge status={`Locked · ${mins}m`} variant="warning" />
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[12px] text-graphite">
                        {lead.contactName && <span className="truncate">{lead.contactName}</span>}
                        {orgView && lead.ownerName && (
                          <span className="shrink-0 text-stone">· {lead.ownerName}</span>
                        )}
                        {signal && <span className="shrink-0 text-stone">· {signal.short}</span>}
                        {lead.source && <span className="shrink-0 capitalize text-stone">· {lead.source}</span>}
                      </div>
                    </Link>
                    <div className="hidden shrink-0 items-center gap-2 sm:flex">
                      <span className="text-[11px] text-stone">{relativeNow(lastActivity, now)}</span>
                      {(lead.status === 'contacted' || lead.status === 'replied') && !locked && (
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); setReplyLead(lead) }}
                          className="rounded-md border border-line p-1.5 text-graphite transition-colors hover:bg-bone hover:text-ink"
                          title="Log prospect reply"
                        >
                          <MessageSquare className="size-3.5" />
                        </button>
                      )}
                      {locked && (
                        <span title={`Locked for ${mins} more minutes`}>
                          <Lock className="size-3.5 text-status-warning" />
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <LogReplyDialog
        open={replyLead !== null}
        onClose={() => setReplyLead(null)}
        leadId={replyLead?.id ?? ''}
        company={replyLead?.company ?? ''}
        onLogged={() => setReplyLead(null)}
      />
    </div>
  )
}
