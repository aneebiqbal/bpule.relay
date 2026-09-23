'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MessageSquare } from 'lucide-react'
import { cn } from 'cn'
import { StatusBadge } from '@/components/ui/status-badge'
import { LeadsBoard } from '@/components/leads-board'
import type { Lead } from '@/lib/domain/types'

type LeadRow = Lead & { ownerName?: string; lastActivityAt?: string | null }

export function LeadsTabView({
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
