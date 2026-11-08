'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from 'cn'

/**
 * Collapsed-by-default section used for AI reasoning, internal notes and lead
 * history. Children mount only when opened, so a closed section costs nothing.
 */
export function Collapsible({
  label,
  count,
  children,
  className,
}: {
  label: string
  count?: number | null
  children: React.ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <section className={className}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] font-medium text-graphite transition-colors hover:bg-bone hover:text-ink"
      >
        <ChevronDown className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden="true" />
        <span className="min-w-0 flex-1">{label}</span>
        {count != null && (
          <span className="shrink-0 rounded-full bg-bone px-1.5 text-[11px] tabular-nums text-stone ring-1 ring-line">{count}</span>
        )}
      </button>
      {open && <div className="mt-1">{children}</div>}
    </section>
  )
}
