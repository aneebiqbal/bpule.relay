import Link from 'next/link'
import { cn } from 'cn'
import { ageLabel } from '@/components/operations/ops-primitives'
import { CONVERSATION_STATE_LABEL, attentionReason } from '@/lib/operations/conversations'
import { sourceLabel } from '@/lib/operations/filters'
import { V4Avatar } from '@/components/v4/primitives'
import { InterventionMenu } from '@/components/operations/intervention-menu'
import type { ChatRow } from '@/lib/operations/chat-queue'

const STATE_CHIP: Record<ChatRow['state'], string> = {
  waiting_on_rep: 'bg-orange/10 text-[#9e4517] ring-orange/20',
  waiting_on_prospect: 'bg-cobalt/10 text-cobalt-dark ring-cobalt/20',
  follow_up_due: 'bg-status-warning/10 text-[#7d5410] ring-status-warning/20',
  meeting: 'bg-status-success/10 text-[#1f5e3c] ring-status-success/20',
  closed: 'bg-bone text-stone ring-line',
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * Thread identity and execution context: who this is, where it came from, who
 * owns it, which profile it is sent from, and the one canonical reason it is in
 * the Inbox. Rendered from the queue row so it is visible immediately; the
 * intelligence pane loads separately and never gates it.
 */
export function ThreadHeader({
  row,
  reps,
  canIntervene,
  tasksAvailable,
  contextAction,
  leadCreatedAt = null,
}: {
  row: ChatRow
  reps: Array<{ id: string; name: string }>
  canIntervene: boolean
  tasksAvailable: boolean
  /** Below xl: the button that opens the intelligence drawer. */
  contextAction?: React.ReactNode
  /** Canonical lead creation date, when the intelligence pane has loaded. */
  leadCreatedAt?: string | null
}) {
  return (
    <header className="flex flex-col gap-2 rounded-xl border border-line bg-bone-raised px-3 py-2.5">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <V4Avatar name={row.person} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="truncate text-[15px] font-medium tracking-[-0.01em] text-ink">{row.person}</h2>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1',
                  STATE_CHIP[row.state],
                )}
              >
                <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                {CONVERSATION_STATE_LABEL[row.state]}
                {row.ageHours !== null && ` · ${ageLabel(row.ageHours)}`}
              </span>
            </div>
            <p className="mt-0.5 truncate text-[12px] text-graphite">
              {[row.title, row.company].filter(Boolean).join(' · ') || '—'}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-stone">
              <span className="inline-flex items-center rounded-full bg-bone px-1.5 py-0.5 ring-1 ring-line text-graphite">
                {sourceLabel(row.sourceRaw)}
              </span>
              <span>
                Profile: <span className="text-graphite">{row.profileName ?? 'Not assigned'}</span>
              </span>
              <span>
                Owner: <span className="text-graphite">{row.ownerName ?? 'Unassigned'}</span>
              </span>
              {row.coveringRepName && row.primaryRepName && (
                <span>
                  Working status:{' '}
                  <span className="text-graphite">
                    Temporary cover for {row.primaryRepName}
                    {row.coveringRepName === row.ownerName ? '' : ` · ${row.coveringRepName}`}
                  </span>
                </span>
              )}
              {leadCreatedAt && (
                <span>
                  Lead created: <span className="text-graphite">{formatDate(leadCreatedAt)}</span>
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 md:pt-1">
          {contextAction}
          <Link
            href={`/leads/${row.leadId}`}
            className="inline-flex h-8 items-center rounded-lg border border-line bg-bone px-2.5 text-[13px] font-medium text-ink transition-colors hover:bg-bone-raised"
          >
            Open lead
          </Link>
          {canIntervene && (
            <InterventionMenu
              repId={row.ownerRepId}
              leadId={row.leadId}
              companyKey={row.companyKey}
              reps={reps}
              canAssign={tasksAvailable}
              notesAnchor="#chat-notes"
              label="More"
            />
          )}
        </div>
      </div>
      <div className="border-t border-line/70 pt-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-stone">Why this needs attention</p>
        <p className="mt-0.5 text-[13px] text-ink">{attentionReason(row)}</p>
      </div>
    </header>
  )
}
