/**
 * Team operating-system contracts.
 *
 * The Team area answers four questions through four surfaces. These tests pin
 * the consolidation: one operating home, one row per person, one profile
 * workspace, one target authority, exception-only coverage, and no duplicate
 * working pages.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { secondaryItems, domainForPathname } from '@/lib/navigation/relay-shell-nav'

const ROOT = process.cwd()
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')
const manager = { isOwner: false, isAdmin: false, isManager: true }
const admin = { isOwner: false, isAdmin: true, isManager: true }

describe('TEAM_NAV_MAX_FIVE_PRIMARY_SURFACES', () => {
  it('Team exposes exactly four operating surfaces plus Structure', () => {
    const items = secondaryItems('team', manager)
    expect(items.map((item) => item.href)).toEqual([
      '/team',
      '/team/people',
      '/team/profiles',
      '/team/performance',
      '/team/groups',
    ])
    expect(items.map((item) => item.label)).toEqual(['Today', 'People', 'Profiles', 'Performance', 'Structure'])
  })

  it('no retired surface is reachable from the Team rail', () => {
    const hrefs = secondaryItems('team', manager).map((item) => item.href)
    for (const retired of ['/team/coverage', '/team/targets', '/team/workload', '/team/activity', '/admin/command']) {
      expect(hrefs).not.toContain(retired)
    }
  })
})

describe('TEAM_TODAY_IS_OPERATIONAL_HOME', () => {
  it('Team → Today renders the operating page', () => {
    expect(read('src/app/(app)/team/page.tsx')).toMatch(/TeamToday/)
    const source = read('src/components/team/team-today.tsx')
    expect(source).toMatch(/Needs attention/)
    expect(source).toMatch(/Coverage exceptions/)
    expect(source).toMatch(/Overdue assigned tasks/)
    expect(source).toMatch(/Recent activity/)
  })

  it('the operating page reads the canonical authorities only', () => {
    const source = read('src/components/team/team-today.tsx')
    expect(source).toMatch(/loadTeamDay/)
    expect(source).toMatch(/getPeopleDirectory|loadPeopleDirectory/)
    expect(source).toMatch(/loadCoveragePlan/)
    expect(source).toMatch(/loadTimeline/)
  })
})

describe('PEOPLE_ONE_ROW_PER_REP', () => {
  it('the directory keys rows by rep, never by channel', () => {
    const source = read('src/components/operations/people-table.tsx')
    expect(source).toMatch(/rowKey=\{\(r\) => r\.repId\}/)
    expect(source).toMatch(/r\.responsibilities/)
  })

  it('the directory carries concrete per-person facts', () => {
    const source = read('src/lib/operations/people.ts')
    expect(source).toMatch(/profiles: string\[\]/)
    expect(source).toMatch(/availability: AvailabilityState \| null/)
  })
})

describe('PROFILES_ONE_ROW_PER_PERSON', () => {
  it('the directory groups channels under one person row', () => {
    const source = read('src/lib/team/profiles.ts')
    expect(source).toMatch(/personKeyByProfile/)
    expect(source).toMatch(/channelDetails/)
    expect(read('src/components/team/team-profiles-table.tsx')).toMatch(/channelDetails\.map/)
  })

  it('the profile workspace links to no competing coverage directory', () => {
    expect(read('src/components/team/team-profiles-table.tsx')).not.toMatch(/href="\/team\/coverage"/)
  })
})

describe('TARGET_EDITING_SINGLE_AUTHORITY', () => {
  it('Team → Targets redirects to the Performance view', () => {
    expect(read('next.config.ts')).toMatch(/source: "\/team\/targets", destination: "\/team\/performance\?view=targets"/)
  })

  it('the Performance target view is read-only', () => {
    const source = read('src/components/team/team-targets-report.tsx')
    expect(source).toMatch(/Target editing lives in Admin/)
    expect(source).not.toMatch(/fetch\('/)
  })

  it('Admin → Daily Targets is the bulk editor', () => {
    expect(read('src/app/(app)/admin/targets/page.tsx')).toMatch(/TargetsManager/)
    expect(read('src/components/targets-manager.tsx')).toMatch(/patchTarget/)
  })
})

describe('COVERAGE_EXCEPTION_ONLY', () => {
  it('the coverage directory redirects to Today', () => {
    expect(read('next.config.ts')).toMatch(/source: "\/team\/coverage", destination: "\/team"/)
  })

  it('Today hides healthy coverage and explains readiness in plain language', () => {
    const source = read('src/components/team/team-today.tsx')
    expect(source).toMatch(/Coverage healthy/)
    expect(source).toMatch(/has not confirmed access/)
    expect(source).toMatch(/backups can operate this profile/)
  })
})

describe('WORKLOAD_EMBEDDED_IN_PEOPLE', () => {
  it('the standalone workload page redirects to People', () => {
    expect(read('next.config.ts')).toMatch(/source: "\/team\/workload", destination: "\/team\/people"/)
  })

  it('People shows concrete workload facts, not a score', () => {
    const source = read('src/components/operations/people-table.tsx')
    expect(source).toMatch(/remaining/)
    expect(source).not.toMatch(/workloadScore|score/)
  })
})

describe('ACTIVITY_NOT_PRIMARY_OPERATION', () => {
  it('Team → Activity redirects to the canonical report', () => {
    expect(read('next.config.ts')).toMatch(/source: "\/team\/activity", destination: "\/reports\/activity"/)
    expect(read('src/app/(app)/reports/activity/page.tsx')).not.toMatch(/redirect\('\/team\/activity'\)/)
  })

  it('the activity report serves managers and reps from one surface', () => {
    expect(read('src/app/(app)/reports/activity/page.tsx')).toMatch(/managerUp/)
  })
})

describe('PERFORMANCE_HISTORICAL_ONLY', () => {
  it('Performance reports outcomes and never edits targets', () => {
    const source = read('src/app/(app)/team/performance/page.tsx')
    expect(source).toMatch(/getPerformance/)
    expect(source).not.toMatch(/patchTarget|createDailyTarget/)
    expect(source).toMatch(/view === 'targets'/)
  })
})

describe('NO_DUPLICATE_PROFILE_MANAGEMENT', () => {
  it('Team has one Profiles destination', () => {
    const hrefs = secondaryItems('team', manager).map((item) => item.href)
    expect(hrefs.filter((href) => href.startsWith('/team/profiles')).length).toBe(1)
  })

  it('the profile operating center owns channels, targets, coverage and tasks', () => {
    const source = read('src/components/team/team-profile-detail.tsx')
    for (const action of ['CoverageConfigPanel', 'ChannelTargetsEditor', 'AssignTaskButton', 'CoverageActions']) {
      expect(source).toMatch(action)
    }
  })
})

describe('NO_DUPLICATE_TARGET_CONFIGURATION', () => {
  it('only Admin → Daily Targets and the profile channel edit targets', () => {
    expect(read('next.config.ts')).toMatch(/source: "\/team\/targets", destination: "\/team\/performance\?view=targets"/)
    expect(read('src/components/team/team-profile-detail.tsx')).toMatch(/ChannelTargetsEditor/)
  })
})

describe('ADMIN_QUALITY_TOOLS_GROUPED', () => {
  it('Admin exposes one System / Quality entry, not seven', () => {
    const hrefs = secondaryItems('admin', admin).map((item) => item.href)
    expect(hrefs).toContain('/admin/system')
    for (const tool of ['/admin/qa', '/admin/scoring-qa', '/admin/dataset', '/admin/training-data', '/admin/ai-usage']) {
      expect(hrefs).not.toContain(tool)
    }
  })

  it('the System / Quality index links every tool', () => {
    const source = read('src/app/(app)/admin/system/page.tsx')
    for (const tool of ['/admin/qa', '/admin/scoring-qa', '/facts', '/admin/dataset', '/admin/training-data', '/admin/ai-usage']) {
      expect(source).toContain(tool)
    }
  })

  it('the quality tools remain reachable routes', () => {
    for (const route of ['admin/qa', 'admin/scoring-qa', 'admin/dataset', 'admin/training-data', 'admin/ai-usage']) {
      expect(existsSync(join(ROOT, `src/app/(app)/${route}/page.tsx`)), route).toBe(true)
    }
  })
})

describe('TEAM_ROUTE_COMPATIBILITY', () => {
  it('retired URLs still resolve to the Team domain', () => {
    for (const pathname of ['/team/coverage', '/team/workload', '/team/activity', '/team/targets']) {
      expect(domainForPathname(pathname), pathname).toBe('team')
    }
  })
})
