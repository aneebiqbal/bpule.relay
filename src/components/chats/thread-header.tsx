import Link from 'next/link'
import { cn } from 'cn'
import { ageLabel } from '@/components/operations/ops-primitives'
import { CONVERSATION_STATE_LABEL } from '@/lib/operations/conversations'
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

/**
 * Thread identity: who this is, where the conversation stands, who owns it and
 * which profile it is sent from. Rendered from the queue row so it is visible
 * immediately; the intelligence pane loads separately and never gates it.
 */
export function ThreadHeader({
  row,
  reps,
  canIntervene,
  tasksAvailable,
  contextAction,
}: {
  row: ChatRow
  reps: Array<{ id: string; name: string }>
  canIntervene: boolean
  tasksAvailable: boolean
  /** Below xl: the button that opens the intelligence drawer. */
  contextAction?: React.ReactNode
}) {
  return (
    <header className="flex flex-col gap-2 rounded-xl border border-line bg-bone-raised px-3 py-2.5 md:flex-row md:items-start md:gap-3">
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
          <p className="mt-0.5 truncate text-[11px] text-stone">
            Owner: <span className="text-graphite">{row.ownerName ?? 'Unassigned'}</span>
            {' · '}Profile: <span className="text-graphite">{row.profileName ?? 'Not assigned'}</span>
          </p>
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
            label="Act"
          />
        )}
      </div>
    </header>
  )
}
