import { cn } from 'cn'
import type { LeadStatus, Verdict } from '@/lib/domain/types'

const VERDICT_STYLES: Record<Verdict, string> = {
  send: 'text-status-send',
  research_more: 'text-status-research',
  skip: 'text-slate',
}

const STATUS_STYLES: Record<LeadStatus, string> = {
  new: 'text-slate',
  contacted: 'text-ink',
  followed_up: 'text-ink',
  replied: 'text-status-replied',
  no: 'text-status-no',
  dead: 'text-slate',
}

export function VerdictWord({
  verdict,
  className,
}: {
  verdict: Verdict | null | undefined
  className?: string
}) {
  if (!verdict) return null
  return (
    <span className={cn('font-medium', VERDICT_STYLES[verdict], className)}>
      {verdict === 'research_more' ? 'research more' : verdict}
    </span>
  )
}

export function StatusWord({
  status,
  className,
}: {
  status: LeadStatus
  className?: string
}) {
  return (
    <span className={cn('font-medium', STATUS_STYLES[status], className)}>
      {status === 'followed_up' ? 'followed up' : status}
    </span>
  )
}