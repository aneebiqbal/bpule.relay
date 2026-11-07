/**
 * ADMIN COCKPIT PARITY
 *
 * The Admin command center is a projection of canonical truth. It must not
 * compute its own counts, and its coverage summary must be the same read Team
 * Coverage uses.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

describe('ADMIN_COCKPIT_SOURCES', () => {
  it('the Admin Home reads canonical sources and computes no counts of its own', () => {
    const home = read('src/components/v4/v4-admin-home.tsx')
    expect(home).toContain('data.rows')
    expect(home).toContain('data.profileExecution')
    expect(home).toContain('data.health')
    expect(home).toContain('coverage?.summary')
    expect(home).not.toContain('fetch(')
  })

  it('the coverage panel reads the canonical coverage summary', () => {
    const panel = read('src/components/coverage/admin-coverage-panel.tsx')
    expect(panel).toContain('summary.covered')
    expect(panel).toContain('summary.backupActive')
    expect(panel).toContain('/api/team/coverage/approve')
    expect(panel).not.toContain('capacity')
  })

  it('the profile list is capped and attention-first', () => {
    const home = read('src/components/v4/v4-admin-home.tsx')
    expect(home).toContain('profileRows.slice(0, 5)')
    expect(home).toContain('buildAdminProfileExecutionRows')
  })

  it('the Admin Home does not carry the demoted analytics sections', () => {
    const home = read('src/components/v4/v4-admin-home.tsx')
    expect(home).not.toContain('ContributionHeatmap')
    expect(home).not.toContain('V3TrendChart')
    expect(home).not.toContain('activityDaily')
    expect(home).not.toContain('trendPoints')
  })
})
