'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MessageSquare, Clock, User, ChevronRight } from 'lucide-react'
import { cn } from 'cn'
import { ScoreRing } from '@/components/score-ring'
import { StatusBadge } from '@/components/ui/status-badge'
import { signalById } from '@/lib/score/signals'
import type { LeadRow, PipelineStage } from './pipeline-utils'
import { formatRelativeTime, truncate } from './pipeline-utils'
import { PipelineQuickActions } from './pipeline-quick-actions'

interface PipelineCardProps {
  lead: LeadRow
  stage: PipelineStage
  now: number
  orgView: boolean
}

export function PipelineCard({ lead, stage, now, orgView }: PipelineCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const signal = signalById(lead.signalType)
  const score = getComparableLeadScoreSafe(lead)

  return (
    <div
      className={cn(
        'group rounded-lg border bg-bone transition-all duration-150',
        isHovered ? 'border-line shadow-sm' : 'border-line/60',
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Card header */}
      <div className="flex items-start gap-2.5 p-3">
        <div className="shrink-0">
          {score !== null ? (
            <ScoreRing score={lead.score} canonicalScore={lead.canonicalScore} size={32} />
          ) : (
            <div className="flex size-8 items-center justify-center rounded-full border border-dashed border-line">
              <MessageSquare className="size-3.5 text-stone" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <Link
            href={`/leads/${lead.id}`}
            className="block truncate text-[13px] font-medium text-ink hover:text-orange transition-colors"
          >
            {lead.company}
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-graphite">
            {lead.contactName && <span className="truncate">{lead.contactName}</span>}
            {lead.senderProfileName && (
              <span className="inline-flex items-center gap-0.5 shrink-0">
                <User className="size-2.5" />
                {lead.senderProfileName}
              </span>
            )}
            {orgView && lead.ownerName && (
              <span className="shrink-0 text-stone">· {lead.ownerName}</span>
            )}
          </div>
        </div>
        <ChevronRight className={cn(
          'size-3.5 shrink-0 text-stone transition-all',
          isHovered ? 'translate-x-0.5 text-orange' : 'opacity-0 group-hover:opacity-100',
        )} />
      </div>

      {/* Message preview */}
      {(lead.lastOutboundText || lead.lastInboundText) && (
        <div className="space-y-1 px-3 pb-2">
          {lead.lastOutboundText && (
            <div className="flex items-start gap-1.5">
              <span className="mt-0.5 shrink-0 text-[10px] font-medium uppercase tracking-wider text-stone">Out</span>
              <p className="truncate text-[11px] text-graphite leading-snug">
                {truncate(lead.lastOutboundText, 50)}
              </p>
            </div>
          )}
          {lead.lastInboundText && (
            <div className="flex items-start gap-1.5">
              <span className="mt-0.5 shrink-0 text-[10px] font-medium uppercase tracking-wider text-status-success">In</span>
              <p className="truncate text-[11px] text-graphite leading-snug">
                {truncate(lead.lastInboundText, 50)}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Meta row */}
      <div className="flex items-center justify-between px-3 pb-2">
        <div className="flex items-center gap-1.5">
          {signal && (
            <StatusBadge status={signal.short} variant="neutral" className="text-[9px] px-1.5 py-0.25" />
          )}
          {lead.followupCount != null && lead.followupCount > 0 && (
            <span className="text-[10px] text-stone">
              Follow-up {lead.followupCount}/3
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-[10px] text-stone">
          <Clock className="size-2.5" />
          {formatRelativeTime(lead.lastActivityAt ?? lead.createdAt, now)}
        </div>
      </div>

      {/* Quick actions */}
      <PipelineQuickActions lead={lead} stage={stage} />
    </div>
  )
}

function getComparableLeadScoreSafe(lead: LeadRow): number | null {
  if (lead.canonicalScore != null) return lead.canonicalScore
  if (lead.score != null) return lead.score
  return null
}
