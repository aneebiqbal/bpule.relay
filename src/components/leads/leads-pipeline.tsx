'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, GripVertical, MessageSquare, Clock, User, PenLine } from 'lucide-react'
import { cn } from 'cn'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { ScoreRing } from '@/components/score-ring'
import { StatusBadge } from '@/components/ui/status-badge'
import { signalById } from '@/lib/score/signals'
import { EmptyState } from '@/components/ui/empty-state'
import { Target } from 'lucide-react'
import type { Lead } from '@/lib/domain/types'
import {
  PIPELINE_COLUMNS,
  TERMINAL_COLUMNS,
  derivePipelineStage,
  filterLeads,
  sortLeads,
  formatRelativeTime,
  truncate,
  type LeadRow,
  type PipelineStage,
  type SortMode,
} from './pipeline-utils'
import { getStalenessColor } from '@/lib/leads/lifecycle-policy'

interface LeadsPipelineProps {
  leads: LeadRow[]
  orgView: boolean
}

interface GroupedLeads {
  to_contact: LeadRow[]
  waiting: LeadRow[]
  needs_reply: LeadRow[]
  done: LeadRow[]
  cold: LeadRow[]
}

export function LeadsPipeline({ leads, orgView }: LeadsPipelineProps) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortMode>('activity')
  const [now, setNow] = useState(() => Date.now())
  const [localGroups, setLocalGroups] = useState<GroupedLeads | null>(null)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const filtered = useMemo(() => filterLeads(leads, search), [leads, search])

  const grouped = useMemo<GroupedLeads>(() => {
    const groups: GroupedLeads = { to_contact: [], waiting: [], needs_reply: [], done: [], cold: [] }
    for (const lead of filtered) {
      const stage = derivePipelineStage(lead)
      groups[stage].push(lead)
    }
    for (const stage of Object.keys(groups) as PipelineStage[]) {
      groups[stage] = sortLeads(groups[stage], sort)
    }
    return groups
  }, [filtered, sort])

  const displayGroups = localGroups ?? grouped

  const totalActive = displayGroups.to_contact.length + displayGroups.waiting.length + displayGroups.needs_reply.length

  const handleDragEnd = useCallback(async (result: DropResult) => {
    if (!result.destination) return
    const sourceStage = result.source.droppableId as PipelineStage
    const destStage = result.destination.droppableId as PipelineStage
    if (sourceStage === destStage) return

    const leadId = result.draggableId
    const lead = filtered.find((l) => l.id === leadId)
    if (!lead) return

    const updatedGroups = { ...displayGroups }
    const leadItem = updatedGroups[sourceStage].find((l) => l.id === leadId)
    if (!leadItem) return

    updatedGroups[sourceStage] = updatedGroups[sourceStage].filter((l) => l.id !== leadId)
    const newArr = [...updatedGroups[destStage]]
    newArr.splice(result.destination.index, 0, leadItem)
    updatedGroups[destStage] = newArr
    setLocalGroups(updatedGroups)

    const success = await executeStageTransition(leadId, sourceStage, destStage, lead)
    if (!success) {
      setLocalGroups(null)
    } else {
      setTimeout(() => setLocalGroups(null), 300)
    }
  }, [displayGroups, filtered])

  if (leads.length === 0) {
    return (
      <EmptyState
        icon={Target}
        title="No leads yet"
        description="Paste a LinkedIn profile, add a company, or import from Upwork. Drag cards between columns to move them through your pipeline."
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
            placeholder="Search…"
            className="w-full rounded-lg border border-line bg-bone py-1.5 pl-8 pr-3 text-[13px] text-ink placeholder:text-stone focus:border-orange focus:outline-none"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          className="rounded-lg border border-line bg-bone px-2 py-1.5 text-[12px] text-ink focus:border-orange focus:outline-none"
        >
          <option value="activity">Last activity</option>
          <option value="score">Highest score</option>
          <option value="recent">Newest</option>
        </select>
        <div className="ml-auto text-[11px] text-stone">{totalActive} active</div>
      </div>

      {/* Kanban — Active pipeline */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
          {PIPELINE_COLUMNS.map((col) => (
            <PipelineColumn
              key={col.id}
              column={col}
              leads={displayGroups[col.id] ?? []}
              now={now}
              orgView={orgView}
            />
          ))}
        </div>
      </DragDropContext>

      {/* Terminal columns */}
      <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
        {TERMINAL_COLUMNS.map((col) => (
          <PipelineColumn
            key={col.id}
            column={col}
            leads={displayGroups[col.id] ?? []}
            now={now}
            orgView={orgView}
          />
        ))}
      </div>
    </div>
  )
}

interface PipelineColumnProps {
  column: { id: PipelineStage; label: string; description: string; dotColor: string; borderColor: string; headerBg: string }
  leads: LeadRow[]
  now: number
  orgView: boolean
}

function PipelineColumn({ column, leads, now, orgView }: PipelineColumnProps) {
  return (
    <div
      className={cn(
        'flex w-[300px] shrink-0 flex-col rounded-xl border border-line overflow-hidden',
        column.borderColor,
        'border-t-[3px]',
      )}
    >
      <div className={cn('flex items-center justify-between px-3 py-2.5', column.headerBg)}>
        <div className="flex items-center gap-2">
          <span className={cn('size-2 rounded-full', column.dotColor)} />
          <h3 className="text-[12px] font-medium text-ink">{column.label}</h3>
        </div>
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-bone px-1.5 text-[10px] font-medium text-stone">
          {leads.length}
        </span>
      </div>

      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              'flex-1 space-y-2 p-2 min-h-[120px] transition-colors duration-150',
              snapshot.isDraggingOver ? 'bg-orange/[0.02]' : 'bg-bone',
            )}
          >
            {leads.length === 0 ? (
              <div className="flex items-center justify-center rounded-lg border border-dashed border-line/60 py-8">
                <p className="text-[11px] text-stone/60">Drop here</p>
              </div>
            ) : (
              leads.map((lead, index) => (
                <Draggable key={lead.id} draggableId={lead.id} index={index}>
                  {(dragProvided, dragSnapshot) => (
                    <LeadCard
                      lead={lead}
                      orgView={orgView}
                      now={now}
                      provided={dragProvided}
                      isDragging={dragSnapshot.isDragging}
                    />
                  )}
                </Draggable>
              ))
            )}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  )
}

interface LeadCardProps {
  lead: LeadRow
  orgView: boolean
  now: number
  provided: any
  isDragging: boolean
}

function LeadCard({ lead, orgView, now, provided, isDragging }: LeadCardProps) {
  const signal = signalById(lead.signalType)
  const score = lead.canonicalScore ?? lead.score ?? null
  const lifecycleState = lead.lifecycle?.state ?? 'active'
  const isCold = lifecycleState === 'cold' || lifecycleState === 'frozen'

  return (
    <div
      ref={provided.innerRef}
      {...provided.draggableProps}
      className={cn(
        'rounded-lg border bg-bone-raised transition-all duration-150',
        isDragging && 'shadow-md border-orange/40 ring-1 ring-orange/20',
        !isDragging && 'border-line/60 hover:border-line hover:shadow-sm',
        isCold && !isDragging && 'opacity-80',
      )}
    >
      <div className="p-3">
        {/* Header row */}
        <div className="flex items-start gap-2.5">
          <div {...provided.dragHandleProps} className="mt-0.5 shrink-0 cursor-grab text-stone/40 hover:text-stone active:cursor-grabbing">
            <GripVertical className="size-3.5" />
          </div>
          <div className="shrink-0">
            {score !== null ? (
              <ScoreRing score={lead.score} canonicalScore={lead.canonicalScore} size={28} />
            ) : (
              <div className="flex size-7 items-center justify-center rounded-full border border-dashed border-line">
                <MessageSquare className="size-3 text-stone" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <Link
              href={`/leads/${lead.id}`}
              className="truncate text-[12px] font-medium text-ink hover:text-orange transition-colors"
            >
              {lead.company}
            </Link>
            {lead.contactName && (
              <p className="truncate text-[10px] text-graphite">{lead.contactName}</p>
            )}
          </div>
        </div>

        {/* Sender + signal + staleness */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {lead.senderProfileName && (
            <span className="inline-flex items-center gap-0.5 rounded-md bg-bone px-1.5 py-0.5 text-[9px] text-stone">
              <User className="size-2" />
              {lead.senderProfileName}
            </span>
          )}
          {signal && (
            <span className="rounded-md bg-bone px-1.5 py-0.5 text-[9px] text-stone">{signal.short}</span>
          )}
          {orgView && lead.ownerName && (
            <span className="text-[9px] text-stone/60">{lead.ownerName}</span>
          )}
          {isCold && lead.lifecycle && (
            <span className="inline-flex items-center gap-0.5 rounded-md bg-status-warning/10 px-1.5 py-0.5 text-[9px] text-status-warning">
              <span className={cn('size-1.5 rounded-full', getStalenessColor(lifecycleState))} />
              {lead.lifecycle.reason}
            </span>
          )}
        </div>

        {/* Message preview */}
        {(lead.lastOutboundText || lead.lastInboundText) && (
          <div className="mt-2 space-y-1">
            {lead.lastOutboundText && (
              <p className="truncate text-[10px] text-graphite leading-snug">
                <span className="text-stone/50">→</span> {truncate(lead.lastOutboundText, 45)}
              </p>
            )}
            {lead.lastInboundText && (
              <p className="truncate text-[10px] text-graphite leading-snug">
                <span className="text-status-success/70">←</span> {truncate(lead.lastInboundText, 45)}
              </p>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-1 text-[10px] text-stone/70">
            <Clock className="size-2.5" />
            {formatRelativeTime(lead.lastActivityAt ?? lead.createdAt, now)}
          </div>
          <div className="flex items-center gap-1.5">
            {lead.followupCount != null && lead.followupCount > 0 && (
              <span className="text-[9px] text-stone/60">F{lead.followupCount}/3</span>
            )}
            {lifecycleState !== 'active' && (
              <span className={cn('size-1.5 rounded-full', getStalenessColor(lifecycleState))} />
            )}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-1 border-t border-line/40 px-2 py-1.5">
        <Link
          href={`/leads/${lead.id}`}
          className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-graphite hover:bg-bone hover:text-ink transition-colors"
        >
          <PenLine className="size-2.5" />
          Open
        </Link>
        {isCold && (
          <Link
            href={`/leads/${lead.id}`}
            className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-orange hover:bg-orange/10 transition-colors ml-auto"
          >
            Reactivate
          </Link>
        )}
      </div>
    </div>
  )
}

async function executeStageTransition(leadId: string, source: PipelineStage, dest: PipelineStage, lead: LeadRow): Promise<boolean> {
  try {
    let endpoint: string | null = null

    if (dest === 'done') {
      endpoint = `/api/leads/${leadId}/status`
    } else if (dest === 'waiting') {
      if (lead.status === 'new') {
        endpoint = `/api/leads/${leadId}/contact`
      } else if (lead.status === 'contacted' && !lead.lastOutboundAt) {
        endpoint = `/api/leads/${leadId}/contact`
      }
    } else if (dest === 'needs_reply') {
      endpoint = `/api/leads/${leadId}/reply`
    } else if (dest === 'to_contact') {
      return true
    }

    if (!endpoint) return true

    const body = dest === 'waiting'
      ? JSON.stringify({ type: lead.status === 'new' ? 'connection' : 'dm', sentText: '[moved via pipeline]' })
      : dest === 'needs_reply'
        ? JSON.stringify({ text: '[client replied]' })
        : JSON.stringify({ status_type: 'closed' })

    const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
    return res.ok
  } catch {
    return false
  }
}


