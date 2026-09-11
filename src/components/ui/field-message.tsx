import { cn } from "cn"

/**
 * Inline validation text under an input. Use FieldError for a failing state and
 * FieldHint for neutral guidance, so every form reads the same.
 */
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
    <p id={id} role="alert" className={cn("text-xs text-status-no", className)}>
      {children}
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
    <p className={cn("text-xs leading-relaxed text-slate", className)}>
      {children}
    </p>
  )
}
