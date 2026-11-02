import Link from 'next/link'
import { OpsFilters } from '@/components/operations/ops-filters'
import { SavedViewsMenu } from '@/components/operations/saved-views-menu'
import { changePct } from '@/lib/operations/reports'
import { OPS_RANGES, type OpsFilters as Filters } from '@/lib/operations/filters'
import type { SavedViewSurface } from '@/lib/operations/saved-views'

/** A count we could not compute is shown as unknown, never as 0. */
export function countText(value: number | null): string {
  return value === null ? '—' : value.toLocaleString()
}

/**
 * Report table: count, step conversion and change vs the previous window.
 * Every row links to the records behind it (zero dead ends).
 */
export function CountTable({
  caption,
  rows,
  showConversion = true,
}: {
  caption: string
  rows: Array<{ key: string; label: string; count: number | null; conversionPct: number | null; previous?: number | null; href: string | null }>
  showConversion?: boolean
}) {
  const showChange = rows.some((r) => r.previous !== undefined)
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-left text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-bone-raised text-[11px] uppercase tracking-[0.06em] text-stone">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Metric</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Count</th>
            {showConversion && <th scope="col" className="px-3 py-2 text-right font-medium">Conversion</th>}
            {showChange && <th scope="col" className="px-3 py-2 text-right font-medium">vs previous</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const change = r.previous === undefined ? null : changePct(r.count, r.previous ?? null)
            return (
              <tr key={r.key} className="border-t border-line/70">
                <th scope="row" className="px-3 py-2 font-medium text-ink">
                  {r.href ? (
                    <Link href={r.href} className="underline-offset-2 hover:underline">
                      {r.label}
                    </Link>
                  ) : (
                    r.label
                  )}
                </th>
                <td className="px-3 py-2 text-right tabular-nums text-ink">{countText(r.count)}</td>
                {showConversion && (
                  <td className="px-3 py-2 text-right tabular-nums text-graphite">{r.conversionPct === null ? '—' : `${r.conversionPct}%`}</td>
                )}
                {showChange && (
                  <td className="px-3 py-2 text-right tabular-nums text-graphite">
                    {change === null ? (
                      <span title="Not shown when the previous window is empty or unknown">—</span>
                    ) : (
                      <span className={change > 0 ? 'text-status-success' : change < 0 ? 'text-status-danger' : undefined}>
                        {change > 0 ? '▲' : change < 0 ? '▼' : ''} {Math.abs(change)}%
                        <span className="sr-only">{change > 0 ? ' increase' : change < 0 ? ' decrease' : ' no change'}</span>
                      </span>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function ReportFilters({
  basePath,
  filters,
  teams,
  reps,
  profiles,
  showRange = true,
  surface,
}: {
  basePath: string
  filters: Filters
  teams: Array<{ id: string; name: string }>
  reps: Array<{ id: string; name: string }>
  profiles: Array<{ id: string; identity_name: string }>
  showRange?: boolean
  surface?: SavedViewSurface
}) {
  return (
    <OpsFilters
      basePath={basePath}
      current={{ range: filters.range, team: filters.team, rep: filters.rep, profile: filters.profile, source: filters.source }}
      filters={[
        ...(showRange ? [{ key: 'range', label: 'Date range', options: OPS_RANGES.map((r) => ({ value: r.value, label: r.label })) }] : []),
        ...(teams.length > 0 ? [{ key: 'team', label: 'Team', allLabel: 'All teams', options: teams.map((t) => ({ value: t.id, label: t.name })) }] : []),
        ...(reps.length > 0 ? [{ key: 'rep', label: 'Rep', allLabel: 'All reps', options: reps.map((r) => ({ value: r.id, label: r.name })) }] : []),
        { key: 'profile', label: 'Profile', allLabel: 'All profiles', options: profiles.map((p) => ({ value: p.id, label: p.identity_name })) },
        {
          key: 'source',
          label: 'Source',
          allLabel: 'All sources',
          options: [
            { value: 'linkedin', label: 'LinkedIn' },
            { value: 'upwork', label: 'Upwork' },
            { value: 'other', label: 'Other' },
          ],
        },
      ]}
      trailing={surface ? <SavedViewsMenu surface={surface} /> : undefined}
    />
  )
}
