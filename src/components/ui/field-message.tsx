import { cn } from "cn"
import { AlertTriangle, Info } from "lucide-react"

export function FieldError({
  id,
  className,
  children,
}: {
  id?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <p id={id} role="alert" className={cn("flex items-start gap-1.5 text-xs text-status-no", className)}>
      <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}

export function FieldHint({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <p className={cn("flex items-start gap-1.5 text-xs leading-relaxed text-slate", className)}>
      <Info className="mt-0.5 size-3 shrink-0 text-slate/60" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}
