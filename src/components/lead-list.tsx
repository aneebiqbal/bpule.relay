"use client"

import Link from "next/link"
import { cn } from "cn"
import { signalById } from "@/lib/score/signals"
import { StatusWord, VerdictWord } from "@/components/status-word"
import { VirtualList } from "@/components/virtual-list"
import { ChevronRight } from "lucide-react"
import type { Lead } from "@/lib/domain/types"

const ROW_HEIGHT = 56

function LeadLink({
  lead,
  showRepliedOnly,
  prefetch,
  top,
}: {
  lead: Lead
  showRepliedOnly?: boolean
  prefetch?: boolean
  top?: boolean
}) {
  const signal = signalById(lead.signalType)
  const sub = [lead.contactName, lead.contactTitle, signal?.short]
    .filter(Boolean)
    .join(" / ")

  return (
    <Link
      href={`/leads/${lead.id}`}
      prefetch={prefetch}
      className={cn(
        "group flex h-full items-center gap-4 px-5 transition-all duration-200 hover:bg-paper-tint/40",
        top && "border-l-[3px] border-l-gold",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="truncate text-sm font-medium text-ink transition-colors group-hover:text-gold">{lead.company}</div>
          {top ? (
            <span className="shrink-0 rounded-full bg-gold/10 px-2 py-0.5 text-[10px] font-medium text-gold">
              Start here
            </span>
          ) : null}
        </div>
        {sub ? (
          <div className="mt-0.5 truncate text-xs text-slate">{sub}</div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {lead.score !== null ? (
          <span className="text-mono-medium text-sm text-ink">{lead.score}/12</span>
        ) : null}
        <span className="w-24 text-right">
          {showRepliedOnly ? (
            <StatusWord status="replied" />
          ) : (
            <VerdictWord verdict={lead.verdict} />
          )}
        </span>
        {!showRepliedOnly && lead.status !== "new" ? (
          <span className="w-24 text-right">
            <StatusWord status={lead.status} />
          </span>
        ) : null}
        <ChevronRight className="size-3.5 text-line/50 transition-all duration-200 group-hover:text-gold group-hover:translate-x-0.5" />
      </div>
    </Link>
  )
}

export function LeadList({
  leads,
  showRepliedOnly,
  highlightTop,
}: {
  leads: Lead[]
  showRepliedOnly?: boolean
  highlightTop?: boolean
}) {
  if (leads.length <= 24) {
    return (
      <div className="overflow-hidden rounded-[1.25rem] border border-line/80 bg-surface-raised">
        <ul className="divide-y divide-line/60">
          {leads.map((lead, i) => (
            <li key={lead.id} className="h-[56px]">
              <LeadLink
                lead={lead}
                showRepliedOnly={showRepliedOnly}
                prefetch={i === 0}
                top={highlightTop && i === 0}
              />
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="rounded-[1.25rem] border border-line/80 bg-surface-raised">
      <VirtualList
        items={leads}
        rowHeight={ROW_HEIGHT}
        className="max-h-[70vh]"
        renderItem={(lead, i) => (
          <LeadLink
            lead={lead}
            showRepliedOnly={showRepliedOnly}
            prefetch={i === 0}
            top={highlightTop && i === 0}
          />
        )}
      />
    </div>
  )
}
