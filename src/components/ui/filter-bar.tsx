"use client"

import * as React from "react"
import { useEffect, useRef, useState } from "react"
import { Search, X } from "lucide-react"
import { cn } from "cn"

export interface FilterChip {
  key: string
  label: string
  onRemove: () => void
}

export interface FilterBarProps {
  /** Controlled search value. Omit to make the field uncontrolled. */
  searchValue?: string
  /** Called with the debounced value. */
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  /** Filter selects / inputs, rendered next to the search field. */
  children?: React.ReactNode
  /** Right-hand slot (e.g. saved views, export). */
  trailing?: React.ReactNode
  /** Active filters as removable chips, rendered above the search row. */
  chips?: FilterChip[]
  /** Removes every active filter at once. */
  onClearAll?: () => void
  className?: string
}

/**
 * The one filter bar. Search is debounced so a keystroke never fires a request;
 * every filter is URL state owned by the page, so this component holds no
 * hidden filter state of its own.
 */
export function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search…",
  children,
  trailing,
  chips,
  onClearAll,
  className,
}: FilterBarProps) {
  const controlled = searchValue !== undefined
  const [draft, setDraft] = useState(searchValue ?? "")
  const [lastExternal, setLastExternal] = useState(searchValue ?? "")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Adopt an external change (the page cleared the filter, or picked a saved
  // view) without an effect — the input is the only writer of its own draft.
  if (controlled && searchValue !== lastExternal) {
    setLastExternal(searchValue ?? "")
    setDraft(searchValue ?? "")
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  function commit(next: string) {
    if (!onSearchChange) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => onSearchChange(next), 250)
  }

  function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.value
    setDraft(next)
    commit(next)
  }

  function clear() {
    if (timer.current) clearTimeout(timer.current)
    setDraft("")
    onSearchChange?.("")
  }

  return (
    <div className={cn('space-y-2', className)}>
      {chips && chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Active filters">
          {chips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 rounded-full border border-line bg-bone-raised px-2 py-0.5 text-[12px] text-ink"
            >
              {chip.label}
              <button
                type="button"
                onClick={chip.onRemove}
                aria-label={`Remove ${chip.label} filter`}
                className="rounded-full p-0.5 text-stone transition-colors hover:bg-bone hover:text-ink"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </span>
          ))}
          {onClearAll ? (
            <button
              type="button"
              onClick={onClearAll}
              className="text-[12px] font-medium text-orange transition-colors hover:underline"
            >
              Clear all
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone"
          aria-hidden="true"
        />
        <input
          type="search"
          role="searchbox"
          aria-label="Search"
          placeholder={searchPlaceholder}
          value={draft}
          onChange={onChange}
          className="w-full rounded-lg border border-line bg-bone py-2 pl-9 pr-8 text-[13px] text-ink placeholder:text-stone/50 focus:border-orange/40 focus:outline-none focus:ring-1 focus:ring-orange/20"
        />
        {draft ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-stone transition-colors hover:text-ink"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {children}

      {trailing ? <div className="ml-auto flex items-center gap-2">{trailing}</div> : null}
      </div>
    </div>
  )
}
