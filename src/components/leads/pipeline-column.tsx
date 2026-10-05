'use client'

import { cn } from 'cn'
import type { LeadRow, PipelineColumnDef } from './pipeline-utils'
import { PipelineCard } from './pipeline-card'

interface PipelineColumnProps {
  column: PipelineColumnDef
  leads: LeadRow[]
  now: number
  orgView: boolean
  isHighlighted: boolean
}

export function PipelineColumn({ column, leads, now, orgView, isHighlighted }: PipelineColumnProps) {
  return (
    <div
      className={cn(
        'flex w-[280px] shrink-0 flex-col rounded-xl border bg-bone transition-all duration-200',
        isHighlighted ? 'border-orange/30 shadow-sm' : 'border-line/60',
      )}
      data-stage={column.id}
    >
      {/* Column header */}
      <div className="flex items-center justify-between border-b border-line/40 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className={cn('size-2 rounded-full', column.dotColor)} />
          <h3 className="text-[12px] font-medium text-ink">{column.label}</h3>
        </div>
        <span className={cn(
          'flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-medium min-w-[20px]',
          leads.length > 0 ? 'bg-bone-raised text-ink' : 'text-stone',
        )}>
          {leads.length}
        </span>
      </div>

      {/* Column description */}
      <p className="px-3 pt-2 text-[10px] text-stone leading-snug">{column.description}</p>

      {/* Cards */}
      <div className="flex-1 space-y-2 overflow-y-auto p-2 scrollbar-thin">
        {leads.length === 0 ? (
          <div className="flex items-center justify-center rounded-lg border border-dashed border-line/60 py-6">
            <p className="text-[11px] text-stone">No leads</p>
          </div>
        ) : (
          leads.map((lead) => (
            <PipelineCard
              key={lead.id}
              lead={lead}
              stage={column.id}
              now={now}
              orgView={orgView}
            />
          ))
        )}
      </div>
    </div>
  )
}
