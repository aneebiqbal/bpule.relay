/**
 * Relay — production closure regression guards.
 *
 * Phase 12 outcome timings · Phase 14 score staleness · Phase 15 one score
 * writer (source scan) · Phase 21 dataset feedback ownership.
 */
import { describe, expect, it } from 'vitest'
import { deriveOutcomeTimings } from '@/lib/sales/outcome-timings'
import { analyzeScoreStaleness } from '@/lib/intelligence-v3/score-staleness'
import { SCORING_VERSION } from '@/lib/intelligence-v3/versions'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (entry.endsWith('.ts')) out.push(full)
  }
  return out
}

describe('Phase 12 — outcome timings', () => {
  it('derives time to first reply and commercial reply', () => {
    const t = deriveOutcomeTimings({
      firstContactAt: '2026-10-01T00:00:00.000Z',
      inbound: [
        { at: '2026-10-03T00:00:00.000Z', text: 'Thanks, we handled it internally.' },
        { at: '2026-10-05T00:00:00.000Z', text: 'My budget is around $30,000, can we talk?' },
      ],
      storedStages: [{ stage: 'meeting', at: '2026-10-07T00:00:00.000Z' }],
    })
    expect(t.firstReplyAt).toBe('2026-10-03T00:00:00.000Z')
    expect(t.firstCommercialReplyAt).toBe('2026-10-05T00:00:00.000Z')
    expect(t.timeToFirstReplyMs).toBe(2 * 86_400_000)
    expect(t.meetingAt).toBe('2026-10-07T00:00:00.000Z')
    expect(t.timeToMeetingMs).toBe(6 * 86_400_000)
  })

  it('returns nulls when nothing happened', () => {
    const t = deriveOutcomeTimings({ firstContactAt: '2026-10-01T00:00:00.000Z', inbound: [], storedStages: [] })
    expect(t.firstReplyAt).toBeNull()
    expect(t.timeToFirstReplyMs).toBeNull()
  })
})

describe('Phase 14 — score staleness', () => {
  it('separates current, stale and unscored rows', () => {
    const report = analyzeScoreStaleness([
      { scoreVersion: SCORING_VERSION, scoredAt: '2026-10-20T00:00:00.000Z' },
      { scoreVersion: 'relay_decision_v3.2.0', scoredAt: '2026-10-10T00:00:00.000Z' },
      { scoreVersion: null, scoredAt: null },
    ])
    expect(report.total).toBe(3)
    expect(report.current).toBe(1)
    expect(report.stale).toBe(1)
    expect(report.unscored).toBe(1)
    expect(report.staleByVersion['relay_decision_v3.2.0']).toBe(1)
    expect(report.oldestStaleAt).toBe('2026-10-10T00:00:00.000Z')
    expect(report.maxStaleAgeDays).toBeGreaterThan(0)
  })
})

describe('Phase 15 — one live score writer', () => {
  const routes = walk(join(ROOT, 'src/app/api')).filter((f) => f.endsWith('route.ts'))

  it('no API route persists a legacy 0-12 rubric score', () => {
    const offenders = routes.filter((file) => {
      const src = readFileSync(file, 'utf8')
      if (!/computeScore\s*\(/.test(src)) return false
      return /score:\s*(?:score|legacyScore)\??\.(?:total|verdict)/.test(src) || /updateLeadScore\(/.test(src)
    })
    expect(offenders).toEqual([])
  })
})

describe('Phase 21 — dataset feedback ownership', () => {
  it('the capture route gates HUMAN_FEEDBACK to the lead owner', () => {
    const src = readFileSync(join(ROOT, 'src/app/api/dataset/capture/route.ts'), 'utf8')
    expect(src).toContain("stage === 'HUMAN_FEEDBACK'")
    expect(src).toContain("VIEW_TEAM_ANALYTICS")
    expect(src).toContain("owner_rep_id !== auth.repId")
    // The unused admin override must not be imported into the capture path.
    expect(src).not.toContain('approveForTraining')
  })
})
