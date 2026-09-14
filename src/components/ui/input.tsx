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
        "h-8 w-full min-w-0 rounded-md border border-line bg-bone-raised px-2.5 py-1.5 text-[13px] transition-all duration-150 outline-none",
        "placeholder:text-stone/50",
        "focus-visible:border-orange/40 focus-visible:ring-2 focus-visible:ring-orange/15",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-bone disabled:opacity-50",
        "aria-invalid:border-status-danger/40 aria-invalid:ring-2 aria-invalid:ring-status-danger/15",
        className
      )}
      {...props}
    />
  )
}

export { Input }
