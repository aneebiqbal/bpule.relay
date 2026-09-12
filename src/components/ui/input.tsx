import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

function Input({
  className,
  type,
  error,
  "aria-invalid": ariaInvalid,
  ...props
}: React.ComponentProps<"input"> & { error?: boolean }) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      aria-invalid={error ? true : ariaInvalid}
      className={cn(
        "h-9 w-full min-w-0 rounded-xl border border-line bg-paper-raised px-3 py-2 text-sm transition-all duration-200 outline-none",
        "placeholder:text-slate/60",
        "focus-visible:border-gold/40 focus-visible:ring-2 focus-visible:ring-gold/20",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-paper-tint disabled:opacity-50",
        "aria-invalid:border-status-no/40 aria-invalid:ring-2 aria-invalid:ring-status-no/20",
        className
      )}
      {...props}
    />
  )
}

export { Input }
