'use client'

import Link from 'next/link'
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

export interface WorkQuota {
  key: string
  label: string
  completed: number
  target: number
  remaining: number
  href: string
}

interface Row extends WorkQuota {
  name: string
  donePct: number
  leftPct: number
}

function barFill(row: Row, pace: number): string {
  if (row.remaining === 0) return 'var(--status-success)'
  if (row.donePct + 8 < pace) return 'var(--status-danger)'
  return 'var(--orange)'
}

function pacePercent(dayElapsedPct: number): number {
  return Math.max(0, Math.min(100, Math.round(dayElapsedPct * 100)))
}

function sortQuotas(categories: WorkQuota[]): WorkQuota[] {
  return [...categories].sort((a, b) => {
    const aPct = a.target > 0 ? a.completed / a.target : 1
    const bPct = b.target > 0 ? b.completed / b.target : 1
    if (aPct !== bPct) return aPct - bPct
    return b.remaining - a.remaining
  })
}

function QuotaTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Row }> }) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  return (
    <div className="rounded-lg border border-line bg-bone-raised px-2.5 py-1.5 text-[11px] shadow-sm">
      <p className="font-medium text-ink">{row.label}</p>
      <p className="text-graphite">{row.completed} done · {row.remaining} left · target {row.target}</p>
    </div>
  )
}

export function WorkPaceChart({
  categories,
  dayElapsedPct,
  totalCompleted,
  totalTarget,
}: {
  categories: WorkQuota[]
  dayElapsedPct: number
  totalCompleted: number
  totalTarget: number
}) {
  const pace = pacePercent(dayElapsedPct)
  const ordered = sortQuotas(categories)
  const rows: Row[] = ordered.map((category) => {
    const donePct = category.target > 0 ? Math.round((category.completed / category.target) * 100) : 0
    return {
      ...category,
      name: category.label,
      donePct,
      leftPct: Math.max(0, 100 - donePct),
    }
  })
  const start = ordered.find((category) => category.remaining > 0) ?? null
  const done = Math.max(0, totalCompleted)
  const left = Math.max(0, totalTarget - totalCompleted)
  const overallPct = totalTarget > 0 ? Math.round((done / totalTarget) * 100) : 0
  const slices = [
    { name: 'Done', value: Math.max(done, 0) },
    { name: 'Left', value: Math.max(left, 0) },
  ]
  const chartHeight = Math.max(168, rows.length * 42)

  return (
    <div className="rounded-lg border border-line bg-bone-raised p-4" aria-label="Today's quota progress">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Today&apos;s quotas</p>
        <p className="text-[11px] text-graphite">
          {pace > 0 ? `Pace line at ${pace}% of the day` : 'Largest gaps first'}
        </p>
      </div>

      <div className="mt-3 grid items-center gap-4 sm:grid-cols-[148px_1fr]">
        <div className="flex items-center gap-3 sm:block">
          <div className="relative h-32 w-32 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={done + left === 0 ? [{ name: 'None', value: 1 }] : slices}
                  dataKey="value"
                  innerRadius={42}
                  outerRadius={58}
                  startAngle={90}
                  endAngle={-270}
                  stroke="none"
                >
                  <Cell fill={done + left === 0 ? 'var(--line)' : 'var(--orange)'} />
                  <Cell fill="var(--bone-200)" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[22px] font-light leading-none text-ink">{overallPct}%</span>
              <span className="mt-1 text-[10px] text-stone">done</span>
            </div>
          </div>
          {start && (
            <div className="min-w-0 sm:mt-3">
              <p className="text-[11px] text-stone">Start here</p>
              <p className="truncate text-[14px] font-medium text-ink">{start.label}</p>
              <p className="text-[12px] text-graphite">{start.remaining} left · {start.completed}/{start.target}</p>
              <Link
                href={start.href}
                className="mt-2 inline-flex rounded bg-ink px-2.5 py-1 text-[11px] font-medium text-bone hover:bg-ink/90"
              >
                Work {start.label}
              </Link>
            </div>
          )}
        </div>

        <div style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
              <XAxis type="number" domain={[0, 100]} hide />
              <YAxis
                type="category"
                dataKey="name"
                width={108}
                reversed
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: 'var(--graphite)' }}
              />
              <Tooltip content={<QuotaTooltip />} cursor={{ fill: 'var(--orange-faint)' }} />
              {pace > 0 && (
                <ReferenceLine
                  x={pace}
                  stroke="var(--ink)"
                  strokeDasharray="3 3"
                  strokeOpacity={0.45}
                />
              )}
              <Bar dataKey="donePct" stackId="quota" name="Done" radius={[3, 0, 0, 3]}>
                {rows.map((row) => (
                  <Cell key={row.key} fill={barFill(row, pace)} />
                ))}
              </Bar>
              <Bar dataKey="leftPct" stackId="quota" name="Left" fill="var(--bone-200)" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {ordered.filter((category) => category.remaining > 0).map((category) => (
          <Link
            key={category.key}
            href={category.href}
            className="rounded border border-line bg-bone px-2 py-1 text-[11px] text-ink hover:bg-bone-raised"
          >
            {category.label} · {category.remaining} left
          </Link>
        ))}
      </div>
    </div>
  )
}
