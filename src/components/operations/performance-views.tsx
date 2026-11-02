import Link from 'next/link'
import { InlineEmpty } from '@/components/operations/ops-primitives'
import type { ExecutionMetrics, FunnelStep, PerformanceData } from '@/lib/operations/performance'

/**
 * Performance tables (Phase 8.22–8.25). Counts and ratios side by side — no
 * charts that hide the numbers, no composite score that ranks people.
 */

function pct(value: number | null): string {
  return value === null ? '—' : `${value}%`
}

export function FunnelTable({ steps, inspectHref }: { steps: FunnelStep[]; inspectHref?: (step: FunnelStep) => string | null }) {
  const max = Math.max(1, steps[0]?.count ?? 0)
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-left text-[13px]">
        <caption className="sr-only">Conversion from lead to won, furthest known stage per lead</caption>
        <thead className="bg-bone-raised text-[11px] uppercase tracking-[0.06em] text-stone">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Stage</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Count</th>
            <th scope="col" className="px-3 py-2 font-medium">Step</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Conversion</th>
            <th scope="col" className="hidden w-1/3 px-3 py-2 font-medium sm:table-cell">
              <span className="sr-only">Share of leads</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {steps.map((s) => {
            const href = inspectHref?.(s) ?? null
            return (
              <tr key={s.key} className="border-t border-line/70">
                <th scope="row" className="px-3 py-2 font-medium text-ink">
                  {href ? (
                    <Link href={href} className="underline-offset-2 hover:underline">
                      {s.label}
                    </Link>
                  ) : (
                    s.label
                  )}
                </th>
                <td className="px-3 py-2 text-right tabular-nums text-ink">{s.count}</td>
                <td className="px-3 py-2 text-graphite">{s.transition ?? '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink">{pct(s.conversionPct)}</td>
                <td className="hidden px-3 py-2 sm:table-cell">
                  <div className="h-1.5 rounded-full bg-bone-raised" aria-hidden="true">
                    <div className="h-1.5 rounded-full bg-orange/70" style={{ width: `${Math.round((s.count / max) * 100)}%` }} />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

interface ComparisonColumn<T> {
  key: string
  header: string
  render: (row: T) => React.ReactNode
  numeric?: boolean
  hideBelow?: 'sm' | 'md' | 'lg'
}

const HIDE: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
}

export function ComparisonTable<T>({
  caption,
  rows,
  rowKey,
  columns,
  empty,
}: {
  caption: string
  rows: T[]
  rowKey: (row: T) => string
  columns: ComparisonColumn<T>[]
  empty: string
}) {
  if (rows.length === 0) return <InlineEmpty>{empty}</InlineEmpty>
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-left text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-bone-raised text-[11px] uppercase tracking-[0.06em] text-stone">
          <tr>
            {columns.map((c, i) => (
              <th
                key={c.key}
                scope="col"
                className={[
                  'whitespace-nowrap px-3 py-2 font-medium',
                  c.numeric ? 'text-right' : '',
                  c.hideBelow ? HIDE[c.hideBelow] : '',
                  i === 0 ? 'sticky left-0 bg-bone-raised' : '',
                ].join(' ')}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-t border-line/70">
              {columns.map((c, i) => {
                const cls = [
                  'px-3 py-2',
                  c.numeric ? 'text-right tabular-nums' : '',
                  c.hideBelow ? HIDE[c.hideBelow] : '',
                  i === 0 ? 'sticky left-0 bg-bone font-medium text-ink' : 'text-ink',
                ].join(' ')
                return i === 0 ? (
                  <th key={c.key} scope="row" className={cls}>
                    {c.render(row)}
                  </th>
                ) : (
                  <td key={c.key} className={cls}>
                    {c.render(row)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function RepComparison({ rows, rangeQuery }: { rows: PerformanceData['byRep']; rangeQuery: string }) {
  return (
    <ComparisonTable
      caption="Execution by rep"
      rows={rows}
      rowKey={(r) => r.repId}
      empty="No rep activity in this window."
      columns={[
        { key: 'rep', header: 'Rep', render: (r) => <Link href={`/team/${r.repId}?tab=performance&${rangeQuery}`} className="hover:underline">{r.repName}</Link> },
        { key: 'worked', header: 'Leads worked', numeric: true, render: (r) => r.metrics.leadsWorked },
        { key: 'messages', header: 'Messages', numeric: true, render: (r) => r.metrics.messages },
        { key: 'replies', header: 'Replies', numeric: true, render: (r) => r.metrics.replies },
        { key: 'rate', header: 'Reply rate', numeric: true, render: (r) => pct(r.replyRate) },
        { key: 'meetings', header: 'Meetings', numeric: true, hideBelow: 'sm', render: (r) => r.metrics.meetings },
        { key: 'proposals', header: 'Proposals', numeric: true, hideBelow: 'md', render: (r) => r.metrics.proposals },
        { key: 'wins', header: 'Wins', numeric: true, hideBelow: 'sm', render: (r) => r.metrics.wins },
        { key: 'tasks', header: 'Tasks done', numeric: true, hideBelow: 'lg', render: (r) => r.metrics.tasksCompleted },
      ]}
    />
  )
}

export function ProfileComparison({ rows, rangeQuery, basePath = '/team/performance' }: { rows: PerformanceData['byProfile']; rangeQuery: string; basePath?: string }) {
  return (
    <ComparisonTable
      caption="Execution by sending profile"
      rows={rows}
      rowKey={(r) => r.profileId ?? 'none'}
      empty="No profile activity in this window."
      columns={[
        {
          key: 'profile',
          header: 'Profile',
          render: (r) =>
            r.profileId ? (
              <Link href={`${basePath}?${rangeQuery}&profile=${r.profileId}`} className="hover:underline">
                {r.profileName}
              </Link>
            ) : (
              <span className="text-status-warning">{r.profileName}</span>
            ),
        },
        { key: 'opps', header: 'New opportunities', numeric: true, render: (r) => r.opportunities },
        { key: 'messages', header: 'Messages', numeric: true, render: (r) => r.metrics.messages },
        { key: 'replies', header: 'Replies', numeric: true, render: (r) => r.metrics.replies },
        { key: 'meetings', header: 'Meetings', numeric: true, hideBelow: 'sm', render: (r) => r.metrics.meetings },
        { key: 'wins', header: 'Wins', numeric: true, hideBelow: 'sm', render: (r) => r.metrics.wins },
        { key: 'rate', header: 'Reply rate', numeric: true, render: (r) => pct(r.replyRate) },
      ]}
    />
  )
}

export function SourceComparison({ rows, rangeQuery }: { rows: PerformanceData['bySource']; rangeQuery: string }) {
  return (
    <ComparisonTable
      caption="Execution by lead source"
      rows={rows}
      rowKey={(r) => r.source}
      empty="No source activity in this window."
      columns={[
        { key: 'source', header: 'Source', render: (r) => <Link href={`/team/performance?${rangeQuery}&source=${r.source}`} className="hover:underline">{r.label}</Link> },
        { key: 'qualified', header: 'Qualified', numeric: true, render: (r) => r.qualified },
        { key: 'contacted', header: 'Contacted', numeric: true, render: (r) => r.contacted },
        { key: 'replies', header: 'Replies', numeric: true, render: (r) => r.replies },
        { key: 'meetings', header: 'Meetings', numeric: true, render: (r) => r.meetings },
        { key: 'wins', header: 'Wins', numeric: true, render: (r) => r.wins },
      ]}
    />
  )
}

export function metricsToStrip(m: ExecutionMetrics, activityHref: (event: string | null) => string) {
  return [
    { label: 'Connections', value: m.connections, href: activityHref('CONNECTION_SENT') },
    { label: 'Messages', value: m.messages, href: activityHref(null) },
    { label: 'Replies', value: m.replies, href: activityHref('REPLY_RECEIVED') },
    { label: 'Meetings', value: m.meetings, href: activityHref('MEETING_BOOKED'), hint: 'Meetings booked in this window.' },
    { label: 'Proposals', value: m.proposals, href: activityHref('UPWORK_PROPOSAL_PREPARED') },
    { label: 'Wins', value: m.wins, href: activityHref('CLIENT_WON') },
    { label: 'Applications', value: m.applications, href: activityHref('UPWORK_APPLIED') },
    { label: 'Tasks completed', value: m.tasksCompleted, href: activityHref('TASKS') },
  ]
}
