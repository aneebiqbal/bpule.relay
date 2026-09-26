'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useHotkeys } from 'react-hotkeys-hook'
import { ArrowRight } from 'lucide-react'
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

function waitLabel(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 60) return `${mins} min`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours} hours`
  return `${Math.round(hours / 24)} days`
}

export function DoThisNext({ action }: DoThisNextProps) {
  const router = useRouter()
  useHotkeys('j', () => { if (action) router.push(action.href) }, {
    preventDefault: true,
    useKey: true,
    enabled: Boolean(action),
  }, [action, router])

  if (!action) return null

  return (
    <section className="rounded-lg border border-orange/40 bg-bone-raised p-4" aria-label="Do this next">
      <div className="flex items-center gap-2">
        <span className="rounded-sm bg-orange px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.12em] text-on-accent">
          {kindLabel(action.kind)}
        </span>
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
          Do This Next
        </p>
      </div>
      <h3 className="mt-2 text-[18px] font-medium tracking-[-0.01em] text-ink">
        {action.title}
      </h3>
      {action.createdAt && (
        <p className="mt-1 text-[12px] font-medium text-orange">Waiting {waitLabel(action.createdAt)}</p>
      )}
      {action.subtitle && (
        <p className="mt-1 text-[13px] text-graphite">{action.subtitle}</p>
      )}

      <div className="mt-4 space-y-3">
        {action.whatHappened && (
          <div className="rounded-md border border-line bg-bone px-3 py-2">
            <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">What</p>
            <p className="mt-0.5 text-[13px] text-ink">{action.whatHappened}</p>
          </div>
        )}
        {action.whyItMatters && (
          <div className="rounded-md border border-line bg-bone px-3 py-2">
            <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">Why</p>
            <p className="mt-0.5 text-[13px] text-ink">{action.whyItMatters}</p>
          </div>
        )}
        {action.proof && (
          <div className="rounded-md border border-orange/20 bg-orange/5 px-3 py-2">
            <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">Evidence</p>
            <p className="mt-0.5 text-[12px] text-ink">{action.proof}</p>
          </div>
        )}
      </div>

      {action.identity && (
        <p className="mt-3 text-[11px] text-stone">
          Working as <span className="font-medium text-ink">{action.identity.name}</span>
          {action.identity.channel && ` · ${action.identity.channel.toUpperCase()}`}
        </p>
      )}

      <div className="mt-3 action-line">
        <Link
          href={action.href}
          className="inline-flex items-center gap-2 text-[13px] font-medium text-orange transition-colors hover:text-orange-light"
        >
          {action.humanAction}
          <ArrowRight className="size-4" />
          <kbd className="rounded border border-orange/30 px-1 text-[10px] text-orange">J</kbd>
        </Link>
      </div>
    </section>
  )
}
