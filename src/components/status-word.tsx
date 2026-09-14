import { cn } from 'cn'
import type { LeadStatus, Verdict } from '@/lib/domain/types'

const VERDICT_STYLES: Record<Verdict, { text: string; dot: string }> = {
  send: { text: 'text-status-success', dot: 'bg-status-success' },
  research_more: { text: 'text-status-warning', dot: 'bg-status-warning' },
  skip: { text: 'text-slate', dot: 'bg-slate' },
}

const STATUS_STYLES: Record<LeadStatus, { text: string; dot: string }> = {
  new: { text: 'text-slate', dot: 'bg-slate' },
  contacted: { text: 'text-ink', dot: 'bg-ink/40' },
  followed_up: { text: 'text-ink', dot: 'bg-ink/40' },
  replied: { text: 'text-status-success', dot: 'bg-status-success' },
  no: { text: 'text-status-danger', dot: 'bg-status-danger' },
  dead: { text: 'text-slate', dot: 'bg-slate' },
}

export function VerdictWord({
  verdict,
  className,
  showDot = true,
}: {
  verdict: Verdict | null | undefined
  className?: string
  showDot?: boolean
}) {
  if (!verdict) return null
  const style = VERDICT_STYLES[verdict]
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-medium', style.text, className)}>
      {showDot && <span className={cn('size-1.5 rounded-full', style.dot)} aria-hidden="true" />}
      {verdict === 'research_more' ? 'research more' : verdict}
    </span>
  )
}

export function StatusWord({
  status,
  className,
  showDot = true,
}: {
  status: LeadStatus
  className?: string
  showDot?: boolean
}) {
  const style = STATUS_STYLES[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-medium', style.text, className)}>
      {showDot && <span className={cn('size-1.5 rounded-full', style.dot)} aria-hidden="true" />}
      {status === 'followed_up' ? 'followed up' : status}
    </span>
  )
}
