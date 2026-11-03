'use client'

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TeamTrendPoint } from '@/lib/operations/team-trend'

/**
 * Team trend — replies, meetings and completed tasks per day. One aggregated
 * SQL read; no raw event transfer. The chart carries a screen-reader summary.
 */
export function TeamTrendChart({ data }: { data: TeamTrendPoint[] }) {
  if (data.length === 0) {
    return <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-[13px] text-graphite">No activity in this window.</p>
  }

  const totals = data.reduce(
    (acc, point) => ({
      replies: acc.replies + point.replies,
      meetings: acc.meetings + point.meetings,
      tasks: acc.tasks + point.tasks,
    }),
    { replies: 0, meetings: 0, tasks: 0 },
  )

  return (
    <div>
      <p className="sr-only">
        Trend chart covering {data.length} days: {totals.replies} replies, {totals.meetings} meetings, {totals.tasks} tasks completed.
      </p>
      <div className="h-64 w-full" role="img" aria-label={`Trend chart: ${totals.replies} replies, ${totals.meetings} meetings, ${totals.tasks} tasks completed`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
            <XAxis
              dataKey="day"
              tickFormatter={(day: string) => new Date(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              tick={{ fontSize: 10, fill: 'var(--stone)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--stone)' }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ fontSize: 11, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bone-raised)' }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="replies" name="Replies" fill="var(--orange)" radius={[2, 2, 0, 0]} />
            <Bar dataKey="meetings" name="Meetings" fill="var(--cobalt)" radius={[2, 2, 0, 0]} />
            <Bar dataKey="tasks" name="Tasks completed" fill="var(--ink)" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
