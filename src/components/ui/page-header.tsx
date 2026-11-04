import * as React from "react"
import { cn } from "cn"

interface PageHeaderProps {
  title: string
  description?: string
  /** Small uppercase label above the title (e.g. "Sales"). */
  eyebrow?: string
  action?: React.ReactNode
  secondaryAction?: React.ReactNode
  /** Reusable FilterBar, rendered under the title row. */
  filters?: React.ReactNode
  /** Saved-view / tab strip, rendered on the same row as the filters. */
  savedView?: React.ReactNode
  breadcrumb?: React.ReactNode
  className?: string
}

/**
 * The one page header. Every operational surface renders this — no surface
 * builds its own hero block.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  action,
  secondaryAction,
  filters,
  savedView,
  breadcrumb,
  className,
}: PageHeaderProps) {
  const hasActions = Boolean(action || secondaryAction)
  const hasMeta = Boolean(filters || savedView)

  return (
    <div className={cn("space-y-3", className)}>
      {breadcrumb && (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[11px] text-stone">
          {breadcrumb}
        </nav>
      )}

      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-stone">{eyebrow}</p>
          )}
          <h1
            className={cn(
              "font-light tracking-[-0.02em] text-ink",
              eyebrow ? "mt-1 text-[24px] leading-tight" : "text-[22px] leading-tight",
            )}
          >
            {title}
          </h1>
          {description && (
            <p className="mt-1.5 max-w-2xl text-[13px] text-graphite">{description}</p>
          )}
        </div>

        {hasActions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {secondaryAction}
            {action}
          </div>
        )}
      </div>

      {hasMeta && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">{filters}</div>
          {savedView && <div className="max-w-full shrink-0 overflow-x-auto">{savedView}</div>}
        </div>
      )}
    </div>
  )
}

interface SectionHeaderProps {
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function SectionHeader({ title, description, action, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-heading text-sm font-medium text-ink">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs text-graphite">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
