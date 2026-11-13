import type { DbClient } from '@/lib/db/types'
import { businessDateRange } from '@/lib/org-clock'
import { canonicalActionFor, type CanonicalAction } from './activity-model'
import { teamHourlyActivitySql } from '@/lib/analytics/aggregates'

/**
 * Admin team execution heatmap — reps × hour for one business date.
 *
 * Intensity is executed work only (the canonical activity types, failures
 * excluded), never logins or page views. One query for the whole org, then
 * in-memory grouping; the PostgREST rollback path buckets the same rows in
 * memory instead.
 */

export interface TeamHeatmapRow {
  repId: string
  repName: string
  /** Executed actions per hour, index 0..23 in the organization's zone. */
  cells: number[]
  total: number
}

export interface TeamHeatmap {
  businessDate: string
  timezone: string
  hours: number[]
  rows: TeamHeatmapRow[]
  max: number
}

export const HEATMAP_HOURS = Array.from({ length: 24 }, (_, index) => index)

interface HourlyRow {
  actor_id: string
  hour: number
  n: number
}

/** Bucket a UTC instant into the organization-local hour. */
export function localHour(iso: string, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const hour = parts.find((part) => part.type === 'hour')
  return hour ? Number(hour.value) % 24 : 0
}

/** Weight one executed action for heatmap intensity. */
export function heatmapWeight(action: CanonicalAction): number {
  if (action === 'CONNECTION_SENT' || action === 'FIRST_DM_SENT') return 2
  if (action === 'FOLLOWUP_SENT' || action === 'REPLY_SENT') return 2
  if (action === 'UPWORK_APPLIED') return 3
  return 1
}

export async function loadTeamHeatmap(params: {
  orgId: string
  businessDate: string
  timezone: string
  client: DbClient
  repIds?: string[] | null
}): Promise<TeamHeatmap> {
  const { orgId, businessDate, timezone, client, repIds } = params
  const { start, end } = businessDateRange(businessDate, timezone)

  const byRep = new Map<string, number[]>()
  const add = (repId: string, hour: number, weight: number) => {
    const cells = byRep.get(repId) ?? Array.from({ length: 24 }, () => 0)
    cells[hour] += weight
    byRep.set(repId, cells)
  }

  let weighted = false
  if (client.raw) {
    const { sql, params: values } = teamHourlyActivitySql({
      orgId,
      start,
      end,
      timezone,
      repIds: repIds ?? undefined,
    })
    const { data, error } = await client.raw<HourlyRow[]>(sql, values)
    if (!error) {
      for (const row of (data ?? []) as HourlyRow[]) {
        add(row.actor_id, Number(row.hour), Number(row.n))
      }
      weighted = true
    }
  }

  if (!weighted) {
    // PostgREST path: read the same rows and bucket them here.
    let query = client
      .from('action_events')
      .select('actor_id, action_type, execution_status, occurred_at')
      .eq('organization_id', orgId)
      .gte('occurred_at', start)
      .lt('occurred_at', end)
      .limit(20_000)
    if (repIds && repIds.length > 0) query = query.in('actor_id', repIds)
    const { data, error } = await query
    if (error) throw error
    for (const row of (data ?? []) as Array<{
      actor_id: string | null
      action_type: string
      execution_status: string | null
      occurred_at: string
    }>) {
      if (!row.actor_id) continue
      const action = canonicalActionFor(row.action_type, row.execution_status)
      if (!action) continue
      add(row.actor_id, localHour(row.occurred_at, timezone), heatmapWeight(action))
    }
  }

  const ids = [...byRep.keys()]
  const nameById = new Map<string, string>()
  if (ids.length > 0) {
    const { data } = await client
      .from('reps')
      .select('id, name')
      .eq('organization_id', orgId)
      .in('id', ids)
      .limit(500)
    for (const row of (data ?? []) as Array<{ id: string; name: string }>) {
      nameById.set(row.id, row.name)
    }
  }

  const rows: TeamHeatmapRow[] = ids.map((repId) => {
    const cells = byRep.get(repId) ?? Array.from({ length: 24 }, () => 0)
    return {
      repId,
      repName: nameById.get(repId) ?? 'Unknown',
      cells,
      total: cells.reduce((sum, value) => sum + value, 0),
    }
  })

  return {
    businessDate,
    timezone,
    hours: HEATMAP_HOURS,
    rows: rows.sort((a, b) => b.total - a.total || a.repName.localeCompare(b.repName)),
    max: rows.reduce((max, row) => Math.max(max, ...row.cells), 1),
  }
}
