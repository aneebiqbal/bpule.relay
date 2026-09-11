"use client"

import Link from "next/link"
import { cn } from "cn"
import { signalById } from "@/lib/score/signals"
import { StatusWord, VerdictWord } from "@/components/status-word"
import { VirtualList } from "@/components/virtual-list"
import type { Lead } from "@/lib/domain/types"

const ROW_HEIGHT = 52

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
        "flex h-full items-center gap-4 px-4 transition-colors hover:bg-paper-tint focus-visible:bg-paper-tint focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        top && "border-l-2 border-l-gold",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="truncate text-sm font-medium text-ink">{lead.company}</div>
          {top ? (
            <span className="shrink-0 rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-medium text-gold">
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
          <span className="font-mono text-sm text-ink">{lead.score}/12</span>
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
      </div>
    </Link>
  )
}

/**
 * The queue, virtualized once it can run long so scrolling stays smooth. The
 * first (top-scored) lead prefetches its workspace since that is almost always
 * the next click; the rest opt out so a long queue never floods the network.
 */
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
      <ul className="divide-y divide-line rounded-xl border border-line bg-paper">
        {leads.map((lead, i) => (
          <li key={lead.id} className="h-[52px]">
            <LeadLink
              lead={lead}
              showRepliedOnly={showRepliedOnly}
              prefetch={i === 0}
              top={highlightTop && i === 0}
            />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="rounded-xl border border-line bg-paper">
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
