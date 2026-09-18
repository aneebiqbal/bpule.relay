import { cn } from "cn"

type StatusVariant = "neutral" | "success" | "warning" | "danger" | "info" | "orange" | "cobalt"

const variantStyles: Record<StatusVariant, { bg: string; text: string; dot: string }> = {
  neutral: { bg: "bg-bone-raised", text: "text-graphite", dot: "bg-stone" },
  success: { bg: "bg-status-success/10", text: "text-status-success", dot: "bg-status-success" },
  warning: { bg: "bg-status-warning/10", text: "text-status-warning", dot: "bg-status-warning" },
  danger: { bg: "bg-status-danger/10", text: "text-status-danger", dot: "bg-status-danger" },
  info: { bg: "bg-status-info/10", text: "text-status-info", dot: "bg-status-info" },
  orange: { bg: "bg-orange/10", text: "text-orange", dot: "bg-orange" },
  cobalt: { bg: "bg-cobalt/10", text: "text-cobalt", dot: "bg-cobalt" },
}

interface StatusBadgeProps {
  status: string
  variant?: StatusVariant
  className?: string
}

export function StatusBadge({ status, variant = "neutral", className }: StatusBadgeProps) {
  const styles = variantStyles[variant]

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        styles.bg,
        styles.text,
        className
      )}
    >
      <span className={cn("size-1.5 rounded-full", styles.dot)} />
      {status}
    </span>
  )
}

export function StatusDot({ variant = "neutral", className }: { variant?: StatusVariant; className?: string }) {
  const styles = variantStyles[variant]
  return <span className={cn("inline-block size-1.5 rounded-full", styles.dot, className)} />
}
