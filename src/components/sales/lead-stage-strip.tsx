'use client'

/**
 * Canonical lifecycle strip for Lead 360.
 *
 * Shows the persisted stage vocabulary in lifecycle order and highlights the
 * lead's current stage. It never invents stages and never lets the UI change
 * state — transitions stay with the canonical owners.
 */
import { cn } from 'cn'
import { STAGE_LABELS, derivePipelineStage, type LeadRow, type PipelineStage } from '@/components/leads/pipeline-utils'

const LIFECYCLE_ORDER: PipelineStage[] = [
  'to_contact',
  'waiting',
  'needs_reply',
  'follow_up_due',
  'done',
]

/** Stages that are not part of the forward lifecycle (side states). */
const SIDE_STAGES: PipelineStage[] = ['observe', 'cold']

export function LeadStageStrip({ lead }: { lead: LeadRow }) {
  const current = derivePipelineStage(lead)
  const isSide = SIDE_STAGES.includes(current)
  const activeIndex = LIFECYCLE_ORDER.indexOf(current)

  return (
    <nav aria-label="Lead lifecycle" className="overflow-x-auto" tabIndex={0}>
      <ol className="flex min-w-max items-center gap-1">
        {LIFECYCLE_ORDER.map((stage, index) => {
          const isCurrent = stage === current
          const isPast = activeIndex >= 0 && index < activeIndex
          return (
            <li key={stage} className="flex items-center gap-1">
              <span
                aria-current={isCurrent ? 'step' : undefined}
                className={cn(
                  'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                  isCurrent
                    ? 'bg-ink text-on-solid'
                    : isPast
                      ? 'text-ink'
                      : 'text-stone',
                )}
              >
                {STAGE_LABELS[stage]}
              </span>
              {index < LIFECYCLE_ORDER.length - 1 ? (
                <span className="h-px w-4 bg-line" aria-hidden />
              ) : null}
            </li>
          )
        })}
        {isSide ? (
          <li className="ml-1">
            <span className="rounded-full bg-status-warning/10 px-2.5 py-1 text-[11px] font-medium text-status-warning">
              {STAGE_LABELS[current]}
            </span>
          </li>
        ) : null}
      </ol>
    </nav>
  )
}
