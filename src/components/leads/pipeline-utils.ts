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
  | 'new'
  | 'connection_pending'
  | 'message_draft'
  | 'waiting_for_reply'
  | 'they_replied'
  | 'followup_due'
  | 'in_conversation'
  | 'won'
  | 'closed'

export interface PipelineColumnDef {
  id: PipelineStage
  label: string
  description: string
  color: 'neutral' | 'warning' | 'cobalt' | 'orange' | 'info' | 'success'
  dotColor: string
}

export const PIPELINE_COLUMNS: PipelineColumnDef[] = [
  { id: 'new', label: 'New', description: 'Extracted, no outreach yet', color: 'neutral', dotColor: 'bg-stone' },
  { id: 'connection_pending', label: 'Connection Pending', description: 'Waiting for acceptance', color: 'warning', dotColor: 'bg-status-warning' },
  { id: 'message_draft', label: 'Message Draft', description: 'Ready to send first message', color: 'cobalt', dotColor: 'bg-cobalt' },
  { id: 'waiting_for_reply', label: 'Waiting for Reply', description: 'Message sent, no response yet', color: 'cobalt', dotColor: 'bg-cobalt' },
  { id: 'they_replied', label: 'They Replied', description: 'Client responded — needs reply', color: 'orange', dotColor: 'bg-orange' },
  { id: 'followup_due', label: 'Follow-Up Due', description: '5+ days, no reply', color: 'warning', dotColor: 'bg-status-warning' },
  { id: 'in_conversation', label: 'In Conversation', description: 'Active back-and-forth', color: 'info', dotColor: 'bg-status-info' },
  { id: 'won', label: 'Won', description: 'Converted / meeting booked', color: 'success', dotColor: 'bg-status-success' },
  { id: 'closed', label: 'Closed', description: 'Lost / not interested / dead', color: 'neutral', dotColor: 'bg-stone' },
]

export function derivePipelineStage(lead: LeadRow, now: number = Date.now()): PipelineStage {
  if (lead.status === 'won') return 'won'
  if (lead.status === 'lost' || lead.status === 'dead' || lead.status === 'no') return 'closed'

  const locked = isLeadLocked(lead.lockedUntil ?? null, now)
  const hasOutbound = !!lead.lastOutboundAt
  const hasInbound = !!lead.lastInboundAt

  if (lead.status === 'replied') {
    if (hasOutbound && hasInbound) {
      const outboundTime = new Date(lead.lastOutboundAt!).getTime()
      const inboundTime = new Date(lead.lastInboundAt!).getTime()
      if (inboundTime > outboundTime) return 'they_replied'
    }
    if (hasInbound && !hasOutbound) return 'they_replied'
    return 'they_replied'
  }

  if (lead.status === 'followed_up') {
    if (hasInbound) {
      const outboundTime = lead.lastOutboundAt ? new Date(lead.lastOutboundAt).getTime() : 0
      const inboundTime = new Date(lead.lastInboundAt!).getTime()
      if (inboundTime > outboundTime) return 'in_conversation'
    }
    return 'followup_due'
  }

  if (lead.status === 'contacted') {
    if (!lead.connectionAcceptedAt && lead.lockedReason === 'connection_note_sent') {
      return 'connection_pending'
    }
    if (!lead.connectionAcceptedAt && locked) {
      return 'connection_pending'
    }
    if (lead.connectionAcceptedAt && !hasOutbound) {
      return 'message_draft'
    }
    if (hasOutbound && !hasInbound) {
      return 'waiting_for_reply'
    }
    if (hasOutbound && hasInbound) {
      const outboundTime = new Date(lead.lastOutboundAt!).getTime()
      const inboundTime = new Date(lead.lastInboundAt!).getTime()
      if (inboundTime > outboundTime) return 'they_replied'
      return 'in_conversation'
    }
    return 'connection_pending'
  }

  if (lead.status === 'new') {
    return 'new'
  }

  return 'new'
}

export function groupLeadsByStage(leads: LeadRow[], now: number = Date.now()): Map<PipelineStage, LeadRow[]> {
  const groups = new Map<PipelineStage, LeadRow[]>()
  for (const col of PIPELINE_COLUMNS) {
    groups.set(col.id, [])
  }
  for (const lead of leads) {
    const stage = derivePipelineStage(lead, now)
    groups.get(stage)!.push(lead)
  }
  return groups
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
  if (!iso) return '—'
  const diff = now - new Date(iso).getTime()
  if (diff < 0) return 'just now'
  if (diff < 60_000) return 'just now'
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return `${Math.floor(days / 7)}w ago`
}

export function truncate(text: string | null | undefined, max: number = 60): string | null {
  if (!text) return null
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + '…'
}
