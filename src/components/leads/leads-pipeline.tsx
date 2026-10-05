'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, ArrowRight, ArrowLeft } from 'lucide-react'
import { cn } from 'cn'
import { EmptyState } from '@/components/ui/empty-state'
import { Target } from 'lucide-react'
import type { Lead } from '@/lib/domain/types'
import {
  PIPELINE_COLUMNS,
  derivePipelineStage,
  filterLeads,
  groupLeadsByStage,
  sortLeads,
  type LeadRow,
  type PipelineStage,
} from './pipeline-utils'
import { PipelineColumn } from './pipeline-column'
import { PipelineHealthBar } from './pipeline-health-bar'

interface LeadsPipelineProps {
  leads: LeadRow[]
  orgView: boolean
}

type SortMode = 'score' | 'recent' | 'activity'

export function LeadsPipeline({ leads, orgView }: LeadsPipelineProps) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortMode>('activity')
  const [activeStage, setActiveStage] = useState<PipelineStage | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [scrollPosition, setScrollPosition] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const filtered = useMemo(() => filterLeads(leads, search), [leads, search])

  const grouped = useMemo(() => {
    const groups = groupLeadsByStage(filtered, now)
    for (const [stage, items] of groups) {
      groups.set(stage, sortLeads(items, sort))
    }
    return groups
  }, [filtered, now, sort])

  const counts = useMemo(() => {
    const c: Record<PipelineStage, number> = {
      new: 0,
      connection_pending: 0,
      message_draft: 0,
      waiting_for_reply: 0,
      they_replied: 0,
      followup_due: 0,
      in_conversation: 0,
      won: 0,
      closed: 0,
    }
    grouped.forEach((items, stage) => {
      c[stage] = items.length
    })
    return c
  }, [grouped])

  const visibleColumns = useMemo(() => {
    if (activeStage) {
      return PIPELINE_COLUMNS.filter((col) => col.id === activeStage)
    }
    return PIPELINE_COLUMNS.filter((col) => col.id !== 'won' && col.id !== 'closed')
  }, [activeStage])

  const terminalColumns = useMemo(() => {
    if (activeStage) return []
    return PIPELINE_COLUMNS.filter((col) => col.id === 'won' || col.id === 'closed')
  }, [activeStage])

  function scrollColumns(direction: 'left' | 'right') {
    const container = document.getElementById('pipeline-scroll')
    if (!container) return
    const amount = 300
    container.scrollBy({ left: direction === 'right' ? amount : -amount, behavior: 'smooth' })
  }

  if (leads.length === 0) {
    return (
      <EmptyState
        icon={Target}
        title="No leads yet"
        description="Paste a LinkedIn profile, add a company, or import from Upwork. Relay scores them and tells you who is worth contacting."
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-stone" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leads…"
            className="w-full rounded-md border border-line bg-bone py-1.5 pl-8 pr-3 text-[13px] text-ink placeholder:text-stone focus:border-orange focus:outline-none"
          />
        </div>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          className="rounded-md border border-line bg-bone px-2 py-1.5 text-[12px] text-ink focus:border-orange focus:outline-none"
        >
          <option value="activity">Last activity</option>
          <option value="score">Highest score</option>
          <option value="recent">Newest first</option>
        </select>
      </div>

      {/* Health bar */}
      <PipelineHealthBar
        counts={counts}
        total={filtered.length}
        activeStage={activeStage}
        onStageClick={setActiveStage}
      />

      {/* Kanban board */}
      <div className="relative">
        {/* Scroll arrows */}
        <button
          type="button"
          onClick={() => scrollColumns('left')}
          className="absolute -left-3 top-1/2 z-10 flex size-6 items-center justify-center rounded-full border border-line bg-bone shadow-sm text-stone hover:text-ink transition-colors"
        >
          <ArrowLeft className="size-3" />
        </button>
        <button
          type="button"
          onClick={() => scrollColumns('right')}
          className="absolute -right-3 top-1/2 z-10 flex size-6 items-center justify-center rounded-full border border-line bg-bone shadow-sm text-stone hover:text-ink transition-colors"
        >
          <ArrowRight className="size-3" />
        </button>

        <div
          id="pipeline-scroll"
          className="flex gap-3 overflow-x-auto pb-2 scroll-smooth"
          style={{ scrollbarWidth: 'thin' }}
        >
          {visibleColumns.map((col) => (
            <PipelineColumn
              key={col.id}
              column={col}
              leads={grouped.get(col.id) ?? []}
              now={now}
              orgView={orgView}
              isHighlighted={activeStage === col.id}
            />
          ))}
        </div>
      </div>

      {/* Terminal states */}
      {terminalColumns.length > 0 && (
        <div className="border-t border-line pt-4">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-stone">Terminal</p>
          <div className="flex gap-3">
            {terminalColumns.map((col) => (
              <PipelineColumn
                key={col.id}
                column={col}
                leads={grouped.get(col.id) ?? []}
                now={now}
                orgView={orgView}
                isHighlighted={false}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
