import { describe, expect, it } from 'vitest'
import { dayVerdict, jobsFromTargets, paceReading, workWindowLabel } from '@/components/rep/daily-jobs'

describe('daily jobs', () => {
  it('turns targets into one row per job, in the order a BD works', () => {
    const jobs = jobsFromTargets([
      {
        targets: [
          { activityType: 'proposal', targetCount: 5, completedCount: 0, remaining: 5 },
          { activityType: 'connection_request', targetCount: 30, completedCount: 0, remaining: 30 },
          { activityType: 'dm', targetCount: 30, completedCount: 2, remaining: 28 },
        ],
      },
    ])
    expect(jobs.map((job) => job.key)).toEqual(['connection_request', 'dm', 'proposal'])
    expect(jobs[0]?.title).toBe('Send connection notes')
    expect(jobs[2]?.title).toBe('Upwork proposals')
  })

  it('calls the day won only when every number is covered', () => {
    expect(dayVerdict(3, 0, true).tone).toBe('won')
    expect(dayVerdict(0, 3, true).tone).toBe('start')
    expect(dayVerdict(1, 2, true).title).toBe('2 still open')
    expect(dayVerdict(0, 3, false).tone).toBe('off')
  })

  it('counts down the work window and warns before it opens', () => {
    expect(workWindowLabel(new Date(2026, 8, 26, 8, 0)).text).toBe('Work starts in 1h')
    expect(workWindowLabel(new Date(2026, 8, 26, 10, 30)).running).toBe(true)
    expect(workWindowLabel(new Date(2026, 8, 26, 10, 30)).text).toBe('6h 30m left')
    expect(workWindowLabel(new Date(2026, 8, 26, 18, 0)).text).toBe('Work window is closed')
  })

  it('says how far the day is ahead or behind the clock', () => {
    const noon = new Date(2026, 8, 26, 13, 0)
    expect(paceReading(0, 100, noon).tone).toBe('behind')
    expect(paceReading(80, 100, noon).tone).toBe('ahead')
    expect(paceReading(100, 100, noon).tone).toBe('won')
    expect(paceReading(0, 100, new Date(2026, 8, 26, 8, 0)).tone).toBe('waiting')
  })
})
