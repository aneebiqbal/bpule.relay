'use client'

/**
 * Sticky right-context panel for Lead 360.
 *
 * Makes the record actionable: the canonical next action, who owns it, which
 * profile is sending, and open work. Unknown values are never zero and never
 * fabricated — they read "Not stated".
 */
import Link from 'next/link'
import { ArrowRight, User } from 'lucide-react'
import { V3Avatar } from '@/components/v3/primitives'
import { formatRelativeTime } from '@/lib/ui/time'
import { deriveNextLeadAction } from '@/lib/relay/lead-state-machine'
import type { LeadDetail } from '@/lib/store/types'

export function LeadContextPanel({
  lead,
  senderProfileName,
  ownerName,
  now,
}: {
  lead: LeadDetail
  senderProfileName: string | null
  ownerName: string | null
  now: number
}) {
  const nextAction = deriveNextLeadAction(lead)
  const lastActivity = lead.messages?.find((m) => m.sentAt)?.sentAt ?? null

  return (
    <aside className="space-y-4 lg:sticky lg:top-12">
      <section className="rounded-lg border border-line bg-bone-raised p-4">
        <h2 className="text-[10px] font-medium uppercase tracking-[0.14em] text-stone">Next action</h2>
        <p className="mt-1.5 text-[13px] font-medium text-ink">{nextAction.primaryLabel}</p>
        <p className="mt-1 text-[12px] text-graphite">{nextAction.reason}</p>
        <Link
          href={`/leads/${lead.id}?tab=conversation`}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98]"
        >
          Start
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </section>

      <section className="rounded-lg border border-line bg-bone-raised p-4">
        <h2 className="text-[10px] font-medium uppercase tracking-[0.14em] text-stone">Ownership</h2>
        <dl className="mt-2 space-y-2">
          <ContextRow label="Owner">
            {ownerName ? (
              <span className="inline-flex items-center gap-1.5">
                <V3Avatar name={ownerName} size="sm" />
                {ownerName}
              </span>
            ) : (
              <Unknown />
            )}
          </ContextRow>
          <ContextRow label="Sending profile">
            {senderProfileName ?? <Unknown />}
          </ContextRow>
          <ContextRow label="Open tasks">
            <Link href={`/leads/${lead.id}?tab=tasks`} className="text-[12px] text-orange-ink hover:underline">
              View tasks
            </Link>
          </ContextRow>
          <ContextRow label="Last activity">
            {lastActivity ? (
              <span suppressHydrationWarning>{formatRelativeTime(lastActivity, now)}</span>
            ) : (
              <Unknown />
            )}
          </ContextRow>
        </dl>
      </section>

      <Link
        href={`/leads/${lead.id}?tab=conversation`}
        className="flex items-center gap-1.5 rounded-md border border-line px-3 py-2 text-[12px] font-medium text-ink transition-colors hover:bg-bone"
      >
        <User className="size-3.5" aria-hidden />
        Open in Inbox
      </Link>
    </aside>
  )
}

function ContextRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-[12px] text-stone">{label}</dt>
      <dd className="min-w-0 text-right text-[13px] text-ink">{children}</dd>
    </div>
  )
}

function Unknown() {
  return <span className="text-[12px] text-stone">Not stated</span>
}
