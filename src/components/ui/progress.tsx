import { cn } from "cn"

interface ProgressProps {
  value: number
  max?: number
  className?: string
  variant?: "default" | "success" | "warning" | "danger"
  size?: "sm" | "md"
  showLabel?: boolean
}

const variantClasses: Record<string, string> = {
  default: "bg-orange",
  success: "bg-status-success",
  warning: "bg-status-warning",
  danger: "bg-status-danger",
}

export function Progress({
  value,
  max = 100,
  className,
  variant = "default",
  size = "sm",
  showLabel,
}: ProgressProps) {
  const pct = Math.min(Math.round((value / max) * 100), 100)

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className={cn(
          "h-1 flex-1 overflow-hidden rounded-full bg-line",
          size === "md" && "h-1.5"
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            variantClasses[variant]
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-mono-medium text-[10px] text-stone">{pct}%</span>
      )}
    </div>
  )
}
