import * as React from "react"
import { Info, AlertTriangle, CheckCircle2, XCircle } from "lucide-react"
import { cn } from "cn"

type NoticeVariant = "info" | "success" | "warning" | "danger"

const variantConfig: Record<NoticeVariant, { icon: React.ComponentType<{ className?: string }>; border: string; bg: string; text: string }> = {
  info: { icon: Info, border: "border-status-info/30", bg: "bg-status-info/5", text: "text-status-info" },
  success: { icon: CheckCircle2, border: "border-status-success/30", bg: "bg-status-success/5", text: "text-status-success" },
  warning: { icon: AlertTriangle, border: "border-status-warning/30", bg: "bg-status-warning/5", text: "text-status-warning" },
  danger: { icon: XCircle, border: "border-status-danger/30", bg: "bg-status-danger/5", text: "text-status-danger" },
}

interface InlineNoticeProps {
  title?: string
  children: React.ReactNode
  variant?: NoticeVariant
  className?: string
}

export function InlineNotice({ title, children, variant = "info", className }: InlineNoticeProps) {
  const config = variantConfig[variant]
  const Icon = config.icon

  return (
    <div
      className={cn(
        "flex gap-2.5 rounded-lg border px-3 py-2.5",
        config.border,
        config.bg,
        className
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", config.text)} />
      <div className="min-w-0 text-[13px]">
        {title && <p className="font-medium text-ink">{title}</p>}
        <div className={cn("text-graphite", title && "mt-0.5")}>{children}</div>
      </div>
    </div>
  )
}
