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
    <span className={cn("flex items-center gap-2", className)}>
      <span
        aria-hidden="true"
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-orange/10 text-[10px] font-semibold text-orange"
      >
        {initials(name)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium text-ink">{name}</span>
        {subtitle ? (
          <span className="block truncate text-[11px] text-graphite">{subtitle}</span>
        ) : null}
      </span>
    </span>
  )
}
