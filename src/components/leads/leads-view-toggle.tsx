'use client'

import { useRouter } from 'next/navigation'
import { Tabs } from '@/components/ui/tabs'
import type { LeadsQuery } from '@/components/leads/pipeline-utils'

export type LeadsViewMode = 'table' | 'pipeline'

/**
 * Table | Pipeline is a representation toggle over the SAME lead data — never a
 * second data model. Filters carry across; the page resets to page 1.
 */
export function LeadsViewToggle({ view, query }: { view: LeadsViewMode; query: LeadsQuery }) {
  const router = useRouter()

  function change(next: string) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue
      if (key === 'page' || key === 'pageSize' || key === 'view') continue
      params.set(key, String(value))
    }
    if (next !== 'table') params.set('view', next)
    router.push(`/leads?${params.toString()}`, { scroll: false })
  }

  return (
    <Tabs
      items={[
        { value: 'table', label: 'Table', hint: 'Every lead as a dense, sortable row.' },
        { value: 'pipeline', label: 'Pipeline', hint: 'The same leads grouped by their canonical stage.' },
      ]}
      value={view}
      onChange={change}
    />
  )
}
