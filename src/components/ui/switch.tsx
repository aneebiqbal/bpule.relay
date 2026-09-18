"use client"

import * as React from "react"
import { cn } from "cn"

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
  description?: string
  className?: string
}

export function Switch({ checked, onChange, disabled, label, description, className }: SwitchProps) {
  const id = React.useId()

  return (
    <div className={cn("flex items-start gap-3", className)}>
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1",
          checked ? "bg-orange" : "bg-line",
          disabled && "opacity-40 pointer-events-none"
        )}
      >
        <span
          className={cn(
            "inline-block size-3.5 transform rounded-full bg-bone shadow-sm transition-transform duration-200",
            checked ? "translate-x-[18px]" : "translate-x-[2px]"
          )}
        />
      </button>
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
