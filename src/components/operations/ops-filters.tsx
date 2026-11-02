'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { FilterBar } from '@/components/ui/filter-bar'
import { Select } from '@/components/ui/select'
import { opsHref } from '@/lib/operations/filters'

export interface OpsFilterOption {
  value: string
  label: string
}

export interface OpsFilterDef {
  key: string
  label: string
  options: OpsFilterOption[]
  /** Label for the "no filter" option. Omit to make the filter required (e.g. range). */
  allLabel?: string
}

/**
 * URL-bound filter row. Holds no filter state: every change is a navigation,
 * so filters survive refresh and the back button (Phase 8.39).
 */
export function OpsFilters({
  basePath,
  current,
  filters,
  search,
  trailing,
}: {
  basePath: string
  current: Record<string, string | null | undefined>
  filters: OpsFilterDef[]
  search?: { placeholder: string }
  trailing?: React.ReactNode
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function go(patch: Record<string, string | null>) {
    startTransition(() => router.push(opsHref(basePath, current, patch), { scroll: false }))
  }

  return (
    <div aria-busy={pending} className={pending ? 'opacity-80 transition-opacity' : undefined}>
      <FilterBar
        searchValue={search ? current.q ?? '' : undefined}
        onSearchChange={search ? (value) => go({ q: value || null }) : undefined}
        searchPlaceholder={search?.placeholder}
        trailing={trailing}
      >
        {filters.map((f) => (
          <label key={f.key} className="min-w-[140px] flex-1 sm:flex-none">
            <span className="sr-only">{f.label}</span>
            <Select
              value={current[f.key] ?? ''}
              onChange={(event) => go({ [f.key]: event.target.value || null })}
              className="h-8 text-[13px]"
            >
              {f.allLabel !== undefined && <option value="">{f.allLabel}</option>}
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </label>
        ))}
      </FilterBar>
    </div>
  )
}
