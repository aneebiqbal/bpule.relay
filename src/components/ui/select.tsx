import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "cn"

function Select({
  className,
  children,
  error,
  "aria-invalid": ariaInvalid,
  ...props
}: React.ComponentProps<"select"> & { error?: boolean }) {
  return (
    <span className="relative block">
      <select
        data-slot="select"
        aria-invalid={error ? true : ariaInvalid}
        className={cn(
          "h-9 w-full min-w-0 appearance-none rounded-xl border border-line bg-paper-raised px-3 pr-9 text-sm text-ink transition-all duration-200 outline-none",
          "focus-visible:border-gold/40 focus-visible:ring-2 focus-visible:ring-gold/20",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "aria-invalid:border-status-no/40 aria-invalid:ring-2 aria-invalid:ring-status-no/20",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-slate"
        aria-hidden="true"
      />
    </span>
  )
}

export { Select }
