'use client'

/**
 * Inbox filter control: one search field, one Filters button, removable chips.
 * Every change is a URL navigation, so the queue view, filters and selected
 * conversation survive refresh and the back button. Secondary manager/admin
 * conditions (meeting/proposal requests, closed, age floors, unassigned,
 * thread review) live in the drawer and reuse the canonical `view` param.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SlidersHorizontal } from 'lucide-react'
import { FilterBar, type FilterChip } from '@/components/ui/filter-bar'
import { Select } from '@/components/ui/select'
import { Drawer } from '@/components/ui/drawer'
import { SavedViewsMenu } from '@/components/operations/saved-views-menu'
import { opsHref } from '@/lib/operations/filters'

export interface ChatFilterDef {
  key: string
  label: string
  allLabel?: string
  options: Array<{ value: string; label: string }>
}

export interface ChatCondition {
  value: string
  label: string
}

interface ChatFiltersProps {
  basePath: string
  current: Record<string, string | null | undefined>
  /** The effective queue view (primary or secondary condition). */
  activeView: string
  filters: ChatFilterDef[]
  /** Secondary queue conditions shown in the drawer. */
  conditions: ChatCondition[]
  managerViews: boolean
  searchPlaceholder?: string
}

function optionLabel(defs: ChatFilterDef[], key: string, value: string): string | null {
  const def = defs.find((d) => d.key === key)
  if (!def) return null
  return def.options.find((o) => o.value === value)?.label ?? value
}

export function ChatFilters({
  basePath,
  current,
  activeView,
  filters,
  conditions,
  managerViews,
  searchPlaceholder = 'Search conversations…',
}: ChatFiltersProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  function go(patch: Record<string, string | null>) {
    startTransition(() => router.push(opsHref(basePath, current, patch), { scroll: false }))
  }

  // Chips mirror the URL: one per active filter, plus the secondary condition.
  const chips: FilterChip[] = []
  for (const key of ['team', 'rep', 'profile', 'source', 'age', 'cstage']) {
    const value = current[key]
    if (!value) continue
    const label = optionLabel(filters, key, value) ?? value
    chips.push({ key, label, onRemove: () => go({ [key]: null }) })
  }
  const activeCondition = conditions.find((c) => c.value === activeView)
  if (activeCondition) {
    chips.push({ key: 'view', label: activeCondition.label, onRemove: () => go({ view: null }) })
  }

  const activeFilterCount = chips.length

  return (
    <div aria-busy={pending} className={pending ? 'opacity-80 transition-opacity' : undefined}>
      <FilterBar
        searchValue={current.q ?? ''}
        onSearchChange={(value) => go({ q: value || null })}
        searchPlaceholder={searchPlaceholder}
        chips={chips}
        onClearAll={chips.length > 0 ? () => go({ team: null, rep: null, profile: null, source: null, age: null, cstage: null, view: null, q: null }) : undefined}
        trailing={
          <>
            <SavedViewsMenu surface="chats" />
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-bone px-2.5 text-[13px] text-ink transition-colors hover:bg-bone-raised"
            >
              <SlidersHorizontal className="size-3.5" aria-hidden="true" />
              Filters
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-orange/10 px-1.5 text-[11px] font-medium tabular-nums text-[#9e4517]">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </>
        }
      />

      <Drawer open={open} onClose={() => setOpen(false)} title="Filters" side="right">
        <div className="space-y-4 p-4">
          {filters.length > 0 && (
            <div className="space-y-3">
              {filters.map((f) => (
                <label key={f.key} className="block">
                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.14em] text-stone">
                    {f.label}
                  </span>
                  <Select
                    value={current[f.key] ?? ''}
                    onChange={(event) => go({ [f.key]: event.target.value || null })}
                    className="h-9 text-[13px]"
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
            </div>
          )}

          {conditions.length > 0 && (
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.14em] text-stone">
                Condition
              </span>
              <Select
                value={activeCondition?.value ?? ''}
                onChange={(event) => go({ view: event.target.value || null })}
                className="h-9 text-[13px]"
              >
                <option value="">Any condition</option>
                {conditions.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </label>
          )}

          <p className="text-[12px] text-stone">
            {managerViews
              ? 'Conditions narrow the queue without changing the primary views.'
              : 'Request and closed conditions are also available here.'}
          </p>
        </div>
      </Drawer>
    </div>
  )
}
