'use client'

import { cn } from 'cn'
import type { PipelineStage, PipelineColumnDef } from './pipeline-utils'
import { PIPELINE_COLUMNS } from './pipeline-utils'

interface PipelineHealthBarProps {
  counts: Record<PipelineStage, number>
  total: number
  activeStage: PipelineStage | null
  onStageClick: (stage: PipelineStage | null) => void
}

const COLOR_MAP: Record<PipelineColumnDef['color'], string> = {
  neutral: 'bg-stone',
  warning: 'bg-status-warning',
  cobalt: 'bg-cobalt',
  orange: 'bg-orange',
  info: 'bg-status-info',
  success: 'bg-status-success',
}

const ACTIVE_COLOR_MAP: Record<PipelineColumnDef['color'], string> = {
  neutral: 'border-stone text-stone',
  warning: 'border-status-warning text-status-warning',
  cobalt: 'border-cobalt text-cobalt',
  orange: 'border-orange text-orange',
  info: 'border-status-info text-status-info',
  success: 'border-status-success text-status-success',
}

export function PipelineHealthBar({ counts, total, activeStage, onStageClick }: PipelineHealthBarProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={() => onStageClick(null)}
        className={cn(
          'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
          activeStage === null
            ? 'border-orange bg-orange/10 text-orange'
            : 'border-line text-graphite hover:bg-bone-raised',
        )}
      >
        All <span className="ml-1 text-[10px]">{total}</span>
      </button>

      {PIPELINE_COLUMNS.filter((col) => col.id !== 'won' && col.id !== 'closed').map((col) => {
        const count = counts[col.id] ?? 0
        if (count === 0) return null
        const isActive = activeStage === col.id
        return (
          <button
            key={col.id}
            type="button"
            onClick={() => onStageClick(isActive ? null : col.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
              isActive
                ? ACTIVE_COLOR_MAP[col.color]
                : 'border-line text-graphite hover:bg-bone-raised',
            )}
          >
            <span className={cn('size-1.5 rounded-full', COLOR_MAP[col.color])} />
            {col.label}
            <span className="text-[10px]">{count}</span>
          </button>
        )
      })}
    </div>
  )
}
