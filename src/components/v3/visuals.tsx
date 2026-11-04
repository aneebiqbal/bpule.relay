'use client'

/**
 * Relay V3 dashboard visuals — the shared measurement surfaces used by Rep Home
 * and Admin Command Center.
 *
 * Restraint over decoration, matching v3/primitives.tsx: one hairline border,
 * 8px radius, a single orange accent, and numbers with their real context.
 * Every visual degrades on its own — a failed chart renders nothing and never
 * takes the metrics, attention list or actions down with it.
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { cn } from 'cn'

export type V3VisualTone = 'neutral' | 'danger' | 'warning' | 'success'

const TONE_TEXT: Record<V3VisualTone, string> = {
  neutral: 'text-ink',
  danger: 'text-status-danger',
  warning: 'text-status-warning',
  success: 'text-status-success',
}

/** Unknown is rendered as an em dash, never as a fake zero. */
export function V3Value({ value }: { value: number | string | null | undefined }) {
  if (value == null) return <span className="text-stone">—</span>
  return <span className="tabular-nums">{value}</span>
}

/**
 * The dense performance strip. One bordered surface with hairline dividers
 * instead of a row of KPI cards, so five metrics read as one comparison.
 */
export function V3MetricStrip({
  items,
  label,
}: {
  items: Array<{
    key: string
    label: string
    value: number | string | null
    hint?: string
    href?: string
    active?: boolean
    onClick?: () => void
    tone?: V3VisualTone
  }>
  label?: string
}) {
  return (
    <div>
      {label && (
        <p className="sr-only">{label}</p>
      )}
      <div
        role="list"
        className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-5"
      >
        {items.map((item, index) => {
          const body = (
            <>
              <p className="truncate text-[11px] text-graphite">{item.label}</p>
              <p
                suppressHydrationWarning
                className={cn(
                  'mt-1 text-[24px] font-medium leading-none tracking-tight',
                  item.tone ? TONE_TEXT[item.tone] : 'text-ink',
                )}
              >
                <V3Value value={item.value} />
              </p>
              {item.hint && (
                <p suppressHydrationWarning className="mt-1 truncate text-[11px] text-stone">
                  {item.hint}
                </p>
              )}
            </>
          )
          // An odd count would leave a lone cell on the last mobile row.
          const spanLast = items.length % 2 !== 0 && index === items.length - 1
          const shell = cn(
            'min-w-0 bg-bone-raised px-4 py-3 text-left transition-colors',
            spanLast && 'max-sm:col-span-2',
            item.href || item.onClick ? 'hover:bg-bone cursor-pointer' : '',
            item.active && 'ring-1 ring-inset ring-orange/25',
          )
          if (item.href) {
            return (
              <Link key={item.key} role="listitem" href={item.href} aria-label={`${item.label}: ${item.value ?? '—'}`} className={shell}>
                {body}
              </Link>
            )
          }
          if (item.onClick) {
            return (
              <button key={item.key} role="listitem" type="button" onClick={item.onClick} aria-label={`${item.label}: ${item.value ?? '—'}`} className={shell}>
                {body}
              </button>
            )
          }
          return (
            <div key={item.key} role="listitem" className={shell}>
              {body}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Progress toward a target. `target <= 0` means no target is configured. */
export function V3ProgressBlock({
  done,
  target,
  label = "Today's progress",
  remainingLabel = 'remaining',
  doneLabel,
}: {
  done: number | null
  target: number
  label?: string
  remainingLabel?: string
  doneLabel?: string
}) {
  const safeDone = Math.max(0, done ?? 0)
  const pct = target > 0 ? Math.min(100, Math.round((safeDone / target) * 100)) : 0
  const complete = target > 0 && safeDone >= target

  return (
    <div className="rounded-lg border border-line bg-bone-raised px-5 py-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[12px] font-medium uppercase tracking-[0.14em] text-stone">{label}</h3>
        <p suppressHydrationWarning className="text-[13px] tabular-nums text-graphite">
          {target > 0 ? `${safeDone} / ${target}` : 'No target set'}
        </p>
      </div>

      <p suppressHydrationWarning className="mt-4 text-[40px] font-light leading-none tracking-[-0.03em] text-ink">
        {target > 0 ? `${pct}%` : '—'}
      </p>
      <p suppressHydrationWarning className="mt-1 text-[12px] text-graphite">
        {complete
          ? `${safeDone} completed · target met`
          : target > 0
            ? `${safeDone} completed · ${Math.max(0, target - safeDone)} ${remainingLabel}`
            : 'Assign daily targets to track progress.'}
      </p>

      <div
        className="mt-4 h-2 w-full overflow-hidden rounded-full bg-line/70"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]', complete ? 'bg-status-success' : 'bg-orange')}
          style={{ width: `${pct}%` }}
        />
      </div>

      {doneLabel && <p className="mt-2 text-[11px] text-stone">{doneLabel}</p>}
    </div>
  )
}

export interface V3BarRow {
  key: string
  label: string
  value: number | string | null
  hint?: string
  href?: string
  /** Bar scale maximum. Defaults to the largest value in the set. */
  max?: number
  tone?: V3VisualTone
}

/**
 * Comparison bars — Rep work breakdown and Admin team execution share this
 * surface so a category count reads the same everywhere. Each row links to its
 * canonical filtered workspace.
 */
export function V3CompareBars({ rows, label }: { rows: V3BarRow[]; label?: string }) {
  const max = useMemo(() => {
    const values = rows.map((row) => (typeof row.value === 'number' ? row.value : 0))
    return Math.max(1, ...values)
  }, [rows])

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-bone-raised">
      {label && <p className="sr-only">{label}</p>}
      <ul className="divide-y divide-line/70">
        {rows.map((row) => {
          const numeric = typeof row.value === 'number' ? row.value : 0
          const pct = Math.round((numeric / max) * 100)
          const inner = (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate text-[13px] font-medium text-ink">{row.label}</p>
                <p suppressHydrationWarning className={cn('shrink-0 text-[14px] font-medium tabular-nums', row.tone ? TONE_TEXT[row.tone] : 'text-ink')}>
                  <V3Value value={row.value} />
                </p>
              </div>
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-bone" aria-hidden="true">
                <div
                  className={cn('h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]', numeric > 0 ? 'bg-orange' : 'bg-transparent')}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {row.hint && <p className="mt-1.5 text-[11px] text-stone">{row.hint}</p>}
            </>
          )
          if (row.href) {
            return (
              <li key={row.key}>
                <Link href={row.href} className="block px-4 py-3 transition-colors hover:bg-bone/60">
                  {inner}
                </Link>
              </li>
            )
          }
          return (
            <li key={row.key} className="px-4 py-3">
              {inner}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export interface V3TrendSeries {
  key: string
  label: string
  color: string
}

export interface V3TrendPoint {
  /** YYYY-MM-DD in the organization's zone. */
  date: string
  [seriesKey: string]: number | string
}

/**
 * Compact trend chart. One aggregated source supplies every point; the range
 * switch only slices that array, so 7d and 30d can never disagree.
 */
export function V3TrendChart({
  points,
  series,
  ranges = ['7d', '30d'],
  initialRange = '7d',
  label,
}: {
  points: V3TrendPoint[]
  series: V3TrendSeries[]
  ranges?: string[]
  initialRange?: string
  label?: string
}) {
  const [range, setRange] = useState(initialRange)
  const days = Number.parseInt(range, 10) || 7
  const visible = useMemo(() => points.slice(-days), [points, days])
  const totals = useMemo(() => {
    const acc: Record<string, number> = {}
    for (const s of series) acc[s.key] = 0
    for (const point of visible) {
      for (const s of series) acc[s.key] += typeof point[s.key] === 'number' ? (point[s.key] as number) : 0
    }
    return acc
  }, [visible, series])

  if (points.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center">
        <p className="text-[12px] text-stone">No activity in this window.</p>
      </div>
    )
  }

  const summary = series.map((s) => `${totals[s.key]} ${s.label.toLowerCase()}`).join(', ')

  return (
    <div>
      <p className="sr-only">
        Trend chart covering {visible.length} days: {summary}.
      </p>
      <div className="mb-3 flex items-center justify-end gap-1" role="group" aria-label="Trend range">
        {ranges.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={range === option}
            onClick={() => setRange(option)}
            className={cn(
              'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
              range === option ? 'bg-bone text-ink ring-1 ring-line' : 'text-stone hover:text-ink',
            )}
          >
            {option}
          </button>
        ))}
      </div>
      <div className="h-44 w-full" role="img" aria-label={`Trend chart: ${summary}`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={visible} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
            <defs>
              {series.map((s) => (
                <linearGradient key={s.key} id={`v3trend-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(date: string) =>
                new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
              }
              tick={{ fontSize: 10, fill: 'var(--stone)' }}
              axisLine={false}
              tickLine={false}
              minTickGap={36}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--stone)' }} axisLine={false} tickLine={false} width={40} />
            <Tooltip
              contentStyle={{
                fontSize: 11,
                border: '1px solid var(--line)',
                borderRadius: 8,
                background: 'var(--bone-raised)',
              }}
              labelFormatter={(date) =>
                new Date(`${String(date)}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
              }
            />
            {series.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={1.75}
                fill={`url(#v3trend-${s.key})`}
                dot={false}
                activeDot={{ r: 3 }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-[11px] text-graphite">
            <span className="size-2 rounded-full" style={{ background: s.color }} aria-hidden="true" />
            {s.label}
            <span suppressHydrationWarning className="tabular-nums text-ink">{totals[s.key]}</span>
          </span>
        ))}
      </div>
      {label && <p className="sr-only">{label}</p>}
    </div>
  )
}
