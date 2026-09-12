import * as React from "react"
import { cn } from "cn"

function Textarea({
  className,
  error,
  "aria-invalid": ariaInvalid,
  ...props
}: React.ComponentProps<"textarea"> & { error?: boolean }) {
  return (
    <textarea
      data-slot="textarea"
      aria-invalid={error ? true : ariaInvalid}
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-xl border border-line bg-paper-raised px-3.5 py-2.5 text-sm transition-all duration-200 outline-none",
        "placeholder:text-slate/60",
        "focus-visible:border-gold/40 focus-visible:ring-2 focus-visible:ring-gold/20",
        "disabled:cursor-not-allowed disabled:bg-paper-tint disabled:opacity-50",
        "aria-invalid:border-status-no/40 aria-invalid:ring-2 aria-invalid:ring-status-no/20",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
