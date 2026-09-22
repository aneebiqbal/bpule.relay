"use client"

import * as React from "react"
import { cn } from "cn"

interface TabItem {
  value: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
  count?: number
}

interface TabsProps {
  items: TabItem[]
  value: string
  onChange: (value: string) => void
  className?: string
}

export function Tabs({ items, value, onChange, className }: TabsProps) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-line bg-bone-raised p-0.5",
        className
      )}
    >
      {items.map(({ value: itemValue, label, icon: Icon, count }) => {
        const active = itemValue === value
        return (
          <button
            key={itemValue}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(itemValue)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-all duration-150",
              active
                ? "bg-solid text-on-solid shadow-sm"
                : "text-graphite hover:bg-bone hover:text-ink"
            )}
          >
            {Icon && <Icon className={cn("size-3.5", active ? "text-on-solid" : "text-stone")} />}
            <span>{label}</span>
            {typeof count === "number" && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                  active ? "bg-on-solid/20 text-on-solid" : "bg-line text-graphite"
                )}
              >
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

interface TabContentProps {
  value: string
  activeValue: string
  children: React.ReactNode
  className?: string
}

export function TabContent({ value, activeValue, children, className }: TabContentProps) {
  if (value !== activeValue) return null
  return (
    <div role="tabpanel" className={cn("fade-in", className)}>
      {children}
    </div>
  )
}
