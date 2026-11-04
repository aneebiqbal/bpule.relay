'use client'

/**
 * The one Sales page header. Prospects, Leads and Pipeline share it so the
 * primary action — Analyze Prospect — is reachable from every Sales surface
 * without returning to Home, and the header never changes shape between them.
 */
import type { ReactNode } from 'react'
import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { cn } from 'cn'

export const SALES_ANALYZE_CTA = { label: 'Analyze Prospect', href: '/prospect' } as const

export function SalesHeader({
  title,
  description,
  count,
  countLabel,
  eyebrow = 'Sales',
  filters,
  meta,
  className,
}: {
  title: string
  description?: string
  /** Small uppercase label above the title. */
  eyebrow?: string
  /** Total records behind the title — never a decorative number. */
  count?: number | null
  countLabel?: string
  /** Search + filter controls. Rendered under the title row. */
  filters?: ReactNode
  /** View toggle / saved views. Right-aligned in the meta row. */
  meta?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-stone">{eyebrow}</p>
          <h1 className="mt-1 flex flex-wrap items-baseline gap-2 text-[24px] font-light leading-tight tracking-[-0.02em] text-ink">
            {title}
            {typeof count === 'number' && (
              <span className="text-[13px] font-normal text-stone">
                {count.toLocaleString()}
                {countLabel ? ` ${countLabel}` : ''}
              </span>
            )}
          </h1>
          {description ? (
            <p className="mt-1.5 max-w-2xl text-[13px] text-graphite">{description}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={SALES_ANALYZE_CTA.href}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md bg-solid px-3.5 py-2 text-[13px] font-medium text-on-solid',
              'transition-transform active:scale-[0.98]',
            )}
          >
            <Sparkles className="size-3.5" aria-hidden />
            {SALES_ANALYZE_CTA.label}
          </Link>
        </div>
      </div>

      {filters || meta ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">{filters}</div>
          {meta ? <div className="max-w-full shrink-0 overflow-x-auto">{meta}</div> : null}
        </div>
      ) : null}
    </div>
  )
}
