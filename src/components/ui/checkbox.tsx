import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "cn"

interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  description?: string
  disabled?: boolean
  className?: string
}

export function Checkbox({ checked, onChange, label, description, disabled, className }: CheckboxProps) {
  const id = React.useId()

  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <div className="relative flex items-center justify-center">
        <input
          type="checkbox"
          id={id}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="peer size-4 shrink-0 appearance-none rounded border border-line bg-bone-raised transition-colors duration-150 checked:border-orange checked:bg-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
        />
        <Check
          className={cn(
            "pointer-events-none absolute size-3 text-bone opacity-0 transition-opacity duration-150 peer-checked:opacity-100"
          )}
          strokeWidth={3}
        />
      </div>
      {(label || description) && (
        <div className="min-w-0">
          {label && (
            <label htmlFor={id} className="text-sm font-medium text-ink cursor-pointer">
              {label}
            </label>
          )}
          {description && (
            <p className="mt-0.5 text-xs text-graphite">{description}</p>
          )}
        </div>
      )}
    </div>
  )
}
