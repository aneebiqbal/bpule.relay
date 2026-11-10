/**
 * RELAY V5.1 Upwork contracts. Each test names the invariant it protects.
 * Behaviour is asserted where it is pure; source assertions cover the wiring.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { canTransition, followUpDueAt, isArchiveCandidate } from '@/lib/upwork/lifecycle'
import { resolveUpworkScope } from '@/lib/upwork/scope'
import { DEFAULT_POLICY, orgWeekRange } from '@/lib/org-clock'

const read = (relative: string) => readFileSync(path.join(process.cwd(), relative), 'utf8')

describe('UPWORK_SAVED_IS_NOT_APPLIED', () => {
  it('a saved job cannot be reported as applied without the apply route', () => {
    // The transition exists, but only the apply route performs it.
    expect(canTransition('SAVED', 'APPLIED')).toBe(true)
    const draft = read('src/app/api/upwork/jobs/[id]/draft/route.ts')
    expect(draft).not.toContain('submitUpworkApplication')
    const apply = read('src/app/api/upwork/jobs/[id]/apply/route.ts')
    expect(apply).toContain('submitUpworkApplication')
  })
})

describe('UPWORK_APPLICATION_EVENT_IS_ANALYTICS_AUTHORITY', () => {
  it('today’s applications come from upwork_applications.submitted_at', () => {
    const source = read('src/lib/team/load-admin-command-center.ts')
    expect(source).toContain("from('upwork_applications')")
    expect(source).toContain("gte('submitted_at', dayRange.start)")
    expect(source).toContain('applicationsToday')
  })
})

describe('UPWORK_REP_SCOPE_EXECUTABLE_ONLY', () => {
  it('excludes archived, backup-only and non-Upwork identities', () => {
    const scope = resolveUpworkScope({
      viewerRepId: 'rep-a',
      isAdmin: false,
      isManager: false,
      managedRepIds: null,
      identities: [
        { repId: 'rep-a', revenueIdentityId: 'i1', profileId: 'p1', channel: 'upwork', access: 'assigned', status: 'active' },
        { repId: 'rep-a', revenueIdentityId: 'i2', profileId: 'p2', channel: 'upwork', access: 'coverage', status: 'active' },
        { repId: 'rep-a', revenueIdentityId: 'i3', profileId: 'p3', channel: 'upwork', access: 'coverage', status: 'archived' },
        { repId: 'rep-a', revenueIdentityId: 'i4', profileId: null, channel: 'upwork', access: 'coverage', status: 'active' },
        { repId: 'rep-a', revenueIdentityId: 'i5', profileId: 'p5', channel: 'linkedin', access: 'assigned', status: 'active' },
      ],
    })
    expect(scope.identityIds).toEqual(['i1', 'i2'])
  })
})

describe('UPWORK_ADMIN_SCOPE_ORG', () => {
  it('the canonical loader returns an organization-wide scope for admins', () => {
    const source = read('src/lib/store/supabase-store.ts')
    expect(source).toContain('if (auth?.isAdmin || auth?.isOwner) return null')
  })
})

describe('UPWORK_DELETE_ONLY_UNTOUCHED', () => {
  it('delete refuses applied and history-bearing jobs', () => {
    const source = read('src/lib/store/supabase-store.ts')
    expect(source).toContain("job.status !== 'SAVED' && job.status !== 'DRAFT_READY'")
    expect(source).toContain('A job with an application cannot be deleted.')
    expect(source).toContain('follow-up or reply history cannot be deleted')
  })
})

describe('UPWORK_APPLIED_ARCHIVES_NOT_DELETES', () => {
  it('the archive route preserves rows instead of deleting them', () => {
    const archive = read('src/app/api/upwork/jobs/[id]/archive/route.ts')
    expect(archive).toContain('archiveUpworkJob')
    expect(archive).not.toContain('.delete()')
    const store = read('src/lib/store/supabase-store.ts')
    expect(store).toContain('status: \'ARCHIVED\'')
  })
})

describe('UPWORK_CONNECTS_REAL_ONLY', () => {
  it('connects come from submitted applications, never from generated proposals', () => {
    const source = read('src/app/api/upwork/connects/route.ts')
    expect(source).toContain('listUpworkApplications')
    expect(source).toContain('connectsSpent')
    expect(source).not.toContain("'profile_id'")
    expect(source).not.toContain('.profile_id')
  })
})

describe('UPWORK_WEEK_USES_ORG_TIMEZONE', () => {
  it('the week window is computed in the organization timezone', () => {
    const policy = { ...DEFAULT_POLICY, organizationId: 'org', timezone: 'Asia/Karachi' }
    const range = orgWeekRange(policy, new Date('2026-11-10T18:30:00.000Z'))
    expect(range.start).toBe('2026-11-03T19:00:00.000Z')
    expect(range.end).toBe('2026-11-10T19:00:00.000Z')
  })
})

describe('UPWORK_PROPOSAL_PROFILE_CONTEXT_PARITY', () => {
  it('draft and apply persist the same selected sender', () => {
    for (const route of [
      'src/app/api/upwork/jobs/[id]/draft/route.ts',
      'src/app/api/upwork/jobs/[id]/apply/route.ts',
    ]) {
      expect(read(route)).toContain('profileId: sender.profile.id')
    }
  })
})

describe('UPWORK_SCREENING_SEPARATE', () => {
  it('screening answers persist with the proposal and freeze on the application', () => {
    const draft = read('src/app/api/upwork/jobs/[id]/draft/route.ts')
    expect(draft).toContain('screeningAnswers')
    const store = read('src/lib/store/supabase-store.ts')
    expect(store).toContain('screening_answers: JSON.stringify(input.screeningAnswers ?? [])')
    expect(store).toContain('p_screening_answers: JSON.stringify(input.screeningAnswers ?? [])')
  })
})

describe('UPWORK_FOLLOWUP_USES_CANONICAL_TASKS', () => {
  it('the apply route schedules the first follow-up through the task engine', () => {
    const apply = read('src/app/api/upwork/jobs/[id]/apply/route.ts')
    expect(apply).toContain('createAssignedTask')
    expect(apply).toContain("kind: 'FOLLOW_UP'")
  })
})

describe('UPWORK_ARCHIVE_PRESERVES_HISTORY', () => {
  it('archive updates status and timestamps; it never deletes child rows', () => {
    const store = read('src/lib/store/supabase-store.ts')
    expect(store).toContain('archived_at: new Date().toISOString()')
    expect(store).not.toContain('from(\'upwork_applications\').delete()')
  })
})

describe('UPWORK_RESPONSE_RATE_FROM_SUBMITTED_APPLICATIONS', () => {
  it('replies and interviews are counted from applications, not messages', () => {
    const source = read('src/lib/upwork/dashboard.ts')
    expect(source).toContain('applications.filter((a) => a.firstReplyAt).length')
    expect(source).toContain('applications.filter((a) => a.interviewAt).length')
  })
})

describe('FOLLOWUP_POLICY', () => {
  it('is one policy: 4 days, 4 days, then a 7-day archive review', () => {
    const submittedAt = '2026-11-01T09:00:00.000Z'
    expect(followUpDueAt(submittedAt, [], null)).toBe('2026-11-05T09:00:00.000Z')
    expect(followUpDueAt(submittedAt, ['2026-11-05T09:00:00.000Z'], null)).toBe('2026-11-09T09:00:00.000Z')
    expect(isArchiveCandidate(submittedAt, ['2026-11-05T09:00:00.000Z', '2026-11-09T09:00:00.000Z'], null, '2026-11-17T09:00:00.000Z')).toBe(true)
  })
})
