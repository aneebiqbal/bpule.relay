import type { Lead } from '@/lib/domain/types'
import { getComparableLeadScore } from '@/lib/score/rubric'
import { isLeadLocked } from '@/lib/leads/lock'

export type LeadRow = Lead & {
  ownerName?: string
  lastActivityAt?: string | null
  senderProfileName?: string | null
  lastOutboundText?: string | null
  lastOutboundAt?: string | null
  lastInboundText?: string | null
  lastInboundAt?: string | null
  followupCount?: number
}

export type PipelineStage =
  | 'to_contact'
  | 'waiting'
  | 'needs_reply'
  | 'done'

export interface PipelineColumnDef {
  id: PipelineStage
  label: string
  description: string
  dotColor: string
  borderColor: string
  headerBg: string
}

export const PIPELINE_COLUMNS: PipelineColumnDef[] = [
  { id: 'to_contact', label: 'To Contact', description: 'Not yet reached out', dotColor: 'bg-stone', borderColor: 'border-t-stone', headerBg: 'bg-bone-raised' },
  { id: 'waiting', label: 'Waiting', description: 'Sent, awaiting reply', dotColor: 'bg-cobalt', borderColor: 'border-t-cobalt', headerBg: 'bg-cobalt/[0.03]' },
  { id: 'needs_reply', label: 'Needs Reply', description: 'They wrote back', dotColor: 'bg-orange', borderColor: 'border-t-orange', headerBg: 'bg-orange/[0.03]' },
  { id: 'done', label: 'Done', description: 'Won or closed', dotColor: 'bg-status-success', borderColor: 'border-t-status-success', headerBg: 'bg-status-success/[0.03]' },
]

export function derivePipelineStage(lead: LeadRow): PipelineStage {
  if (lead.status === 'won' || lead.status === 'lost' || lead.status === 'dead' || lead.status === 'no') return 'done'
  if (lead.status === 'replied') return 'needs_reply'

  const hasOutbound = !!lead.lastOutboundAt
  const hasInbound = !!lead.lastInboundAt

  if (lead.status === 'followed_up') {
    if (hasInbound && hasOutbound) {
      const inboundTime = new Date(lead.lastInboundAt!).getTime()
      const outboundTime = new Date(lead.lastOutboundAt!).getTime()
      if (inboundTime > outboundTime) return 'needs_reply'
    }
    return 'waiting'
  }

  if (lead.status === 'contacted') {
    if (hasOutbound && !hasInbound) return 'waiting'
    if (hasInbound && hasOutbound) {
      const inboundTime = new Date(lead.lastInboundAt!).getTime()
      const outboundTime = new Date(lead.lastOutboundAt!).getTime()
      if (inboundTime > outboundTime) return 'needs_reply'
    }
    return 'waiting'
  }

  return 'to_contact'
}

export type SortMode = 'score' | 'recent' | 'activity'

export function sortLeads(leads: LeadRow[], mode: SortMode): LeadRow[] {
  const sorted = [...leads]
  switch (mode) {
    case 'score':
      sorted.sort((a, b) => getComparableLeadScore(b) - getComparableLeadScore(a))
      break
    case 'recent':
      sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      break
    case 'activity':
      sorted.sort((a, b) => {
        const aT = a.lastActivityAt ?? a.createdAt
        const bT = b.lastActivityAt ?? b.createdAt
        return new Date(bT).getTime() - new Date(aT).getTime()
      })
      break
  }
  return sorted
}

export function filterLeads(leads: LeadRow[], search: string): LeadRow[] {
  if (!search.trim()) return leads
  const q = search.toLowerCase()
  return leads.filter((lead) => {
    const hay = [
      lead.company,
      lead.contactName ?? '',
      lead.signalEvidence ?? '',
      lead.companyKey,
      lead.senderProfileName ?? '',
      lead.ownerName ?? '',
    ].join(' ').toLowerCase()
    return hay.includes(q)
  })
}

export function formatRelativeTime(iso: string | null | undefined, now: number): string {
  if (!iso) return ''
  const diff = now - new Date(iso).getTime()
  if (diff < 0) return 'just now'
  if (diff < 60_000) return 'just now'
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d`
  return `${Math.floor(days / 7)}w`
}

export function truncate(text: string | null | undefined, max: number = 80): string | null {
  if (!text) return null
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + '…'
}
