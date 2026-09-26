'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MessageSquare, Clock, ArrowRight } from 'lucide-react'
import { cn } from 'cn'
import { StatusBadge } from '@/components/ui/status-badge'
import { LeadsBoard } from '@/components/leads-board'
import { rowRelationshipLabel } from '@/components/leads-board'
import type { Lead } from '@/lib/domain/types'

type LeadRow = Lead & { ownerName?: string; lastActivityAt?: string | null }

type ConversationGroup = 'needs_reply' | 'followup_due' | 'waiting' | 'recent'

function conversationGroup(lead: LeadRow): ConversationGroup {
  if (lead.status === 'replied') return 'needs_reply'
  if (lead.status === 'followed_up') return 'followup_due'
  if (lead.status === 'contacted') {
    if (!lead.connectionAcceptedAt && lead.lockedReason === 'connection_note_sent') return 'waiting'
    return 'waiting'
  }
  return 'recent'
}

const GROUP_LABEL: Record<ConversationGroup, string> = {
  needs_reply: 'Needs your reply',
  followup_due: 'Follow-ups due',
  waiting: 'Waiting on them',
  recent: 'Recent',
}

const GROUP_ORDER: ConversationGroup[] = ['needs_reply', 'followup_due', 'waiting', 'recent']

function rowSubtitle(lead: LeadRow): string {
  if (lead.status === 'replied') return 'They wrote back — reply while it\'s fresh'
  if (lead.status === 'followed_up') return 'No reply logged — time to follow up'
  if (lead.status === 'contacted') {
    if (!lead.connectionAcceptedAt && lead.lockedReason === 'connection_note_sent') return 'Connection sent — waiting for them'
    return 'Message sent — waiting for reply'
  }
  return 'Active conversation'
}

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

  const grouped = new Map<ConversationGroup, LeadRow[]>()
  for (const g of GROUP_ORDER) grouped.set(g, [])
  for (const lead of leads) {
    const g = conversationGroup(lead)
    grouped.get(g)!.push(lead)
  }

  return (
    <div className="space-y-4">
      {GROUP_ORDER.filter((g) => grouped.get(g)!.length > 0).map((group) => {
        const items = grouped.get(group)!
        return (
          <div key={group}>
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-stone">{GROUP_LABEL[group]}</p>
            <ul className="mt-1.5 overflow-hidden rounded-lg border border-line bg-bone-raised shadow-sm divide-y divide-line/60">
              {items.map((lead) => (
                <li key={lead.id}>
                  <Link href={`/leads/${lead.id}`} className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-bone sm:px-5">
                    <div className="shrink-0">
                      <div className={cn(
                        'flex size-[36px] items-center justify-center rounded-full',
                        group === 'needs_reply' ? 'bg-orange/10' : 'border border-line bg-bone',
                      )}>
                        {group === 'needs_reply' ? (
                          <MessageSquare className="size-4 text-orange" />
                        ) : group === 'followup_due' ? (
                          <Clock className="size-4 text-status-warning" />
                        ) : (
                          <MessageSquare className="size-4 text-stone" />
                        )}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-medium text-ink">{lead.company}</span>
                        {lead.contactName && (
                          <span className="truncate text-[12px] text-graphite">{lead.contactName}</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[12px] text-graphite">{rowSubtitle(lead)}</p>
                    </div>
                    <div className="shrink-0">
                      <ArrowRight className="size-4 text-stone transition-transform group-hover:translate-x-0.5 group-hover:text-orange" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
