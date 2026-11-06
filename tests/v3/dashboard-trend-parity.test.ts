import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  buildActivityTrendPoints,
  type DailyActivity,
  type ActivityTrendSeries,
} from '@/lib/performance/activity-model'
import { ADMIN_TREND_SERIES } from '@/lib/admin/v3-command-present'
import { REP_TREND_SERIES } from '@/lib/rep-home/v3-present'

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

function day(date: string, overrides: Partial<DailyActivity['breakdown']> = {}): DailyActivity {
  return {
    date,
    totalActions: 0,
    weightedActivity: 0,
    active: true,
    breakdown: {
      leadsAnalyzed: 0,
      leadsSaved: 0,
      connections: 0,
      firstDMs: 0,
      followups: 0,
      replies: 0,
      upworkApplications: 0,
      meetings: 0,
      wins: 0,
      referrals: 0,
      ...overrides,
    },
    events: [],
  }
}

describe('ADMIN_DASHBOARD_TREND', () => {
  it('emits one point per day, in the canonical day order', () => {
    const points = buildActivityTrendPoints(
      [day('2026-11-01'), day('2026-11-02'), day('2026-11-03')],
      new Map(),
      ADMIN_TREND_SERIES,
    )
    expect(points.map((point) => point.date)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03'])
  })

  it('takes every series from the canonical activity breakdown', () => {
    const points = buildActivityTrendPoints(
      [day('2026-11-01', { replies: 4, meetings: 2, wins: 1 })],
      new Map(),
      ADMIN_TREND_SERIES,
    )
    expect(points[0]).toMatchObject({ replies: 4, meetings: 2, wins: 1 })
  })

  it('emits exactly the configured series — nothing invented, nothing missing', () => {
    const points = buildActivityTrendPoints([day('2026-11-01')], new Map(), ADMIN_TREND_SERIES)
    expect(Object.keys(points[0]).sort()).toEqual(['date', 'meetings', 'replies', 'wins'])
  })

  it('zero-fills task completions for a day the task aggregate missed (Rep series)', () => {
    const points = buildActivityTrendPoints(
      [day('2026-11-01'), day('2026-11-02')],
      new Map([['2026-11-02', 3]]),
      REP_TREND_SERIES as ActivityTrendSeries[],
    )
    expect(points[0]).toMatchObject({ replies: 0, meetings: 0, tasks: 0 })
    expect(points[1].tasks).toBe(3)
  })

  it('Rep Home builds the trend from the canonical activity breakdown', () => {
    const repLoader = read('src/app/(app)/dashboard/page.tsx')
    expect(repLoader).toContain('buildActivityTrendPoints(activityDaily, tasksTrend, REP_TREND_SERIES)')
  })

  it('only uses canonical breakdown keys (or tasks) as series on both dashboards', () => {
    const keys: Array<keyof DailyActivity['breakdown'] | 'tasks'> = [
      'leadsAnalyzed', 'leadsSaved', 'connections', 'firstDMs', 'followups', 'replies',
      'upworkApplications', 'meetings', 'wins', 'referrals', 'tasks',
    ]
    for (const series of [...ADMIN_TREND_SERIES, ...(REP_TREND_SERIES as ActivityTrendSeries[])]) {
      expect(keys).toContain(series.key)
    }
  })
})
