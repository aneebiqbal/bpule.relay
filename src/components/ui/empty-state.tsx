import * as React from "react"
import { cn } from "cn"

interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-bone-raised/40 px-6 py-10 text-center",
        className
      )}
    >
      {Icon && (
        <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-bone">
          <Icon className="size-5 text-stone" />
        </div>
      )}
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && (
        <p className="max-w-xs text-[13px] text-graphite">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
