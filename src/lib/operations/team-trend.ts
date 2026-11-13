import type { DbClient } from '@/lib/db/types'
import { teamTasksTrendSql, teamTrendSql, type TeamTrendScope } from '@/lib/analytics/aggregates'

/**
 * Team trend — replies, meetings and completed tasks per day from the
 * aggregated SQL path. Returns null when the aggregate is unavailable (for
 * example the Supabase path), so the UI can hide the section rather than show
 * invented numbers.
 */
export interface TeamTrendPoint {
  day: string
  replies: number
  meetings: number
  tasks: number
}

export async function loadTeamTrend(client: DbClient, scope: TeamTrendScope): Promise<TeamTrendPoint[] | null> {
  if (!client.raw) return null

  const trend = teamTrendSql(scope)
  const tasks = teamTasksTrendSql(scope)
  const [trendRes, taskRes] = await Promise.all([
    client.raw<{ day: string; replies: number; meetings: number }[]>(trend.sql, trend.params),
    client.raw<{ day: string; tasks: number }[]>(tasks.sql, tasks.params),
  ])
  if (trendRes.error || taskRes.error) {
    console.error('[team-trend] aggregate failed', trendRes.error?.message, taskRes.error?.message)
    return null
  }

  const byDay = new Map<string, TeamTrendPoint>()
  for (const row of trendRes.data ?? []) {
    const day = String(row.day)
    byDay.set(day, { day, replies: Number(row.replies), meetings: Number(row.meetings), tasks: 0 })
  }
  for (const row of taskRes.data ?? []) {
    const day = String(row.day)
    const point = byDay.get(day) ?? { day, replies: 0, meetings: 0, tasks: 0 }
    point.tasks = Number(row.tasks)
    byDay.set(day, point)
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day))
}
