/**
 * Release consolidation contracts — the cleanup must stay cleaned up.
 *
 * One Inbox authority in the shell, one Work scope rule, no duplicate Team
 * report, no dead create commands, and the manager role reaches Assign Task.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

describe('SIDEBAR_INBOX_CANONICAL', () => {
  it('the shell badges read the canonical Inbox authority', () => {
    const source = read('src/lib/operations/sidebar-counts.ts')
    expect(source).toMatch(/getInboxCountsForRep/)
    expect(source).toMatch(/getInboxCountsForOrg/)
    expect(source).not.toMatch(/from\('leads'\)[\s\S]{0,200}status/)
  })

  it('the needs-reply predicate delegates to the canonical derivation', () => {
    expect(read('src/lib/operations/sidebar-counts.ts')).toMatch(/deriveConversationRow/)
  })
})

describe('SIDEBAR_WORK_SHARED_CLASSIFIER', () => {
  it('the badge uses the same classifier as /tasks', () => {
    expect(read('src/lib/operations/sidebar-counts.ts')).toMatch(/isCanonicalActiveTask/)
    expect(read('src/lib/tasks/rank-unified-tasks.ts')).toMatch(/export function isCanonicalActiveTask/)
  })
})

describe('WORK_SCOPE_PARITY', () => {
  it('/tasks and /dashboard use the same whole-day scope', () => {
    const tasks = read('src/app/(app)/tasks/page.tsx')
    const dash = read('src/app/(app)/dashboard/page.tsx')
    expect(tasks).toMatch(/filterLeadsByWorkspace\([^,]+, null\)/)
    expect(tasks).toMatch(/filterActionsByWorkspace\([^,]+, [^,]+, null\)/)
    expect(dash).toMatch(/filterLeadsByWorkspace\([^,]+, null\)/)
  })
})

describe('TEAM_REPORT_REDIRECT', () => {
  it('/reports/team redirects to the canonical Team performance surface', () => {
    const page = read('src/app/(app)/reports/team/page.tsx')
    expect(page).toMatch(/redirect\('\/team\/performance'\)/)
    expect(read('src/lib/navigation/relay-shell-nav.ts')).not.toMatch(/href: '\/reports\/team'/)
  })
})

describe('NO_DEAD_CREATE_COMMANDS', () => {
  it('Cmd-K exposes only resolving canonical destinations', () => {
    const palette = read('src/components/command-palette.tsx')
    expect(palette).not.toMatch(/studio\/drafts\/new/)
    expect(palette).not.toMatch(/router\.push\('\/inbound'\)/)
    expect(palette).not.toMatch(/filter=referred/)
  })
})

describe('GLOBAL_CREATE_MANAGER', () => {
  it('the shell passes the manager flag so managers see Assign Task', () => {
    expect(read('src/components/v4/v4-app-shell.tsx')).toMatch(/<GlobalCreateMenu[^>]*isManager=\{isManager\}/)
  })
})

describe('NO_DEAD_COMPONENTS', () => {
  it('the deleted dead components stay deleted', () => {
    const dead = [
      'src/components/dashboard/rep-dashboard.tsx',
      'src/components/manager/manager-home-view.tsx',
      'src/components/manage-profiles.tsx',
      'src/components/profiles-manager.tsx',
      'src/components/dashboard/analytics/pipeline-analytics-view.tsx',
      'src/components/admin/team-live-board.tsx',
      'src/components/signal/signal-feed.tsx',
      'src/components/app-back-button.tsx',
      'src/components/ui/action-line.tsx',
      'src/components/ui/avatar.tsx',
      'src/components/ui/breadcrumb.tsx',
      'src/components/ui/inline-notice.tsx',
      'src/components/ui/intelligent-empty-state.tsx',
      'src/components/ui/page-shell.tsx',
      'src/components/ui/sparkline.tsx',
      'src/components/ui/switch.tsx',
    ]
    for (const file of dead) expect(existsSync(join(ROOT, file)), file).toBe(false)
  })
})

describe('NO_DEAD_API_ROUTES', () => {
  it('the superseded API families stay deleted', () => {
    const dead = [
      'src/app/api/content/intelligence/discover/route.ts',
      'src/app/api/content/intelligence/forge/route.ts',
      'src/app/api/content/intelligence/interview/route.ts',
      'src/app/api/content/intelligence/org-themes/route.ts',
      'src/app/api/growth/decision/route.ts',
      'src/app/api/growth/draft/route.ts',
      'src/app/api/growth/memory/route.ts',
      'src/app/api/growth/publications/route.ts',
      'src/app/api/growth/today/route.ts',
      'src/app/api/profile-intelligence/legacy/classify/route.ts',
      'src/app/api/profile-intelligence/profiles/[id]/sources/route.ts',
      'src/app/api/relay/persona-daily/route.ts',
    ]
    for (const file of dead) expect(existsSync(join(ROOT, file)), file).toBe(false)
  })
})
