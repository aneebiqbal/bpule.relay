import { cn } from "cn"

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function IdentityChip({
  name,
  subtitle,
  className,
}: {
  name: string
  subtitle?: string
  className?: string
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span
        aria-hidden="true"
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gold/15 to-gold/5 text-[11px] font-semibold text-gold ring-1 ring-gold/10"
      >
        {initials(name)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-ink">{name}</span>
        {subtitle ? (
          <span className="block truncate text-xs text-slate">{subtitle}</span>
        ) : null}
      </span>
    </span>
  )
}
