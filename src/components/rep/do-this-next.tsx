import Link from 'next/link'
import { ArrowRight, MessageSquare, Clock, Zap } from 'lucide-react'
import type { RelayTodayAction } from '@/components/relay-today-workspace'

interface DoThisNextProps {
  action: RelayTodayAction | null
}

function kindLabel(kind: string): string {
  switch (kind) {
    case 'reply_needed': return 'Reply'
    case 'followup_due': return 'Follow up'
    case 'high_fit_lead': return 'Contact'
    case 'new_opportunity': return 'Review'
    case 'job_worth_apply': return 'Apply'
    case 'proposal_ready': return 'Proposal'
    case 'lead_going_cold': return 'Decide'
    case 'content_opportunity': return 'Studio'
    case 'admin_review': return 'Review'
    case 'inbound_opportunity': return 'Inbound'
    default: return 'Action'
  }
}

function KindIcon({ kind, className }: { kind: string; className?: string }) {
  if (kind === 'reply_needed' || kind === 'inbound_opportunity') return <MessageSquare className={className} />
  if (kind === 'followup_due') return <Clock className={className} />
  return <Zap className={className} />
}

export function DoThisNext({ action }: DoThisNextProps) {
  if (!action) return null

  return (
    <section className="rounded-lg border border-orange/30 bg-orange/[0.03] p-5">
      <div className="flex items-center gap-2">
        <KindIcon kind={action.kind} className="size-4 text-orange" />
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-orange">
          Do This Next
        </p>
      </div>
      <h3 className="mt-2 text-[18px] font-medium tracking-[-0.01em] text-ink">
        {kindLabel(action.kind)}: {action.title}
      </h3>
      {action.subtitle && (
        <p className="mt-1 text-[13px] text-graphite">{action.subtitle}</p>
      )}
      {action.identity && (
        <p className="mt-2 text-[11px] text-stone">
          Working as <span className="font-medium text-ink">{action.identity.name}</span>
          {action.identity.channel && ` · ${action.identity.channel.toUpperCase()}`}
        </p>
      )}
      <div className="mt-3">
        <Link
          href={action.href}
          className="inline-flex items-center gap-2 rounded-md bg-orange px-4 py-2 text-[13px] font-medium text-bone transition-colors hover:bg-orange-dark"
        >
          {action.humanAction}
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </section>
  )
}
