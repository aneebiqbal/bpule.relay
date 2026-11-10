import { describe, expect, it } from 'vitest'
import { upworkStageDetail, upworkStageLabel } from '@/lib/upwork/pipeline'
import { UPWORK_JOB_STATUSES, mapLegacyStatus } from '@/lib/upwork/lifecycle'

describe('upwork pipeline stages', () => {
  it('names every canonical stage', () => {
    expect(upworkStageLabel('SAVED')).toBe('Saved')
    expect(upworkStageLabel('DRAFT_READY')).toBe('Draft ready')
    expect(upworkStageLabel('APPLIED')).toBe('Applied')
    expect(upworkStageLabel('CLIENT_REPLIED')).toBe('Client replied')
    expect(upworkStageLabel('INTERVIEW')).toBe('Interview')
    expect(upworkStageLabel('WON')).toBe('Won')
    expect(upworkStageLabel('LOST')).toBe('Lost')
    expect(upworkStageLabel('ARCHIVED')).toBe('Archived')
  })

  it('has no legacy states left', () => {
    for (const legacy of ['new', 'drafted', 'replied', 'no', 'dead', 'shortlisted', 'interviewing', 'awarded', 'rejected']) {
      expect(UPWORK_JOB_STATUSES).not.toContain(legacy)
    }
    expect(upworkStageDetail('SAVED')).toMatch(/Not reviewed yet/i)
  })

  it('maps legacy rows onto the lifecycle for the migration', () => {
    expect(mapLegacyStatus('new')).toBe('SAVED')
    expect(mapLegacyStatus('drafted')).toBe('DRAFT_READY')
    expect(mapLegacyStatus('replied')).toBe('CLIENT_REPLIED')
    expect(mapLegacyStatus('dead')).toBe('ARCHIVED')
    expect(mapLegacyStatus('no')).toBe('ARCHIVED')
  })
})
