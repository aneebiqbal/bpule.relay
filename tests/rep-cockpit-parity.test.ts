/**
 * REP COCKPIT PARITY
 *
 * The Rep daily cockpit is a projection of canonical truth. It must not
 * compute its own counts, must not mix manager-assigned work into the
 * Relay-ranked "Do this next" list, and must not carry the analytics sections
 * that were demoted to Insights.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

describe('REP_COCKPIT_SOURCES', () => {
  it('the Rep Home reads canonical sources and computes no counts of its own', () => {
    const home = read('src/components/v4/v4-rep-home.tsx')
    expect(home).toContain('selectAssignedOpenTasks')
    expect(home).toContain('selectAssignedOverdueTasks')
    expect(home).toContain('targetSummary')
    expect(home).toContain('data.day')
    expect(home).not.toContain('fetch(')
  })

  it('the profile surface reads canonical coverage and completion, never DB terms', () => {
    const profiles = read('src/components/coverage/rep-profiles-today.tsx')
    expect(profiles).toContain('coverage?.own')
    expect(profiles).toContain('coverage?.covering')
    expect(profiles).toContain('profilesToday')
    expect(profiles).toContain('/api/rep/coverage')
    expect(profiles).not.toContain('revenue_identity')
    expect(profiles).not.toContain('identity_assignment')
    expect(profiles).not.toContain('profile_assignment')
  })

  it('Do this next excludes manager-assigned work', () => {
    const home = read('src/components/v4/v4-rep-home.tsx')
    expect(home).toContain("task.source !== 'ASSIGNED'")
  })

  it('the day control uses the canonical availability APIs', () => {
    const control = read('src/components/coverage/rep-day-control.tsx')
    expect(control).toContain('/api/rep/day')
    expect(control).toContain('/api/rep/day/close')
    expect(control).toContain('/api/rep/availability')
  })

  it('the Rep Home does not carry the demoted analytics sections', () => {
    const home = read('src/components/v4/v4-rep-home.tsx')
    expect(home).not.toContain('ContributionHeatmap')
    expect(home).not.toContain('V3TrendChart')
    expect(home).not.toContain('V3StageStrip')
    expect(home).not.toContain('V3CompareBars')
    expect(home).not.toContain('TargetWindows')
  })
})
