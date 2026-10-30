/**
 * COMMAND_CENTRE_GATE
 *
 * The Command Centre has to answer the operational questions in one place, in
 * severity order, with role enforcement and without a query per rep.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { compareTeamRows, STATE_PRIORITY, type TeamDayRow } from '@/lib/rep-day/team'
import { recoveredRepIds } from '@/lib/scheduler/plan'
import { isValidTimeZone, normalizePolicy, parseClock, validatePolicyInput } from '@/lib/org-clock'

const ROOT = process.cwd()
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

function row(overrides: Partial<TeamDayRow> & { repId: string; state: TeamDayRow['state'] }): TeamDayRow {
  return {
    repName: overrides.repId,
    repRole: 'rep',
    checkInAt: null,
    closedAt: null,
    lateStart: false,
    exceptionState: 'NONE',
    commitmentProgress: 0,
    requiredRemaining: 0,
    minutesRemaining: 0,
    repliesWaiting: 0,
    actionsToday: 0,
    pipelineCreated: 0,
    lastActivityAt: null,
    identities: [],
    ...overrides,
  }
}

describe('COMMAND_CENTRE_GATE — priority order', () => {
  it('orders by operational severity, not alphabetically', () => {
    const rows = [
      row({ repId: 'a-closed', state: 'CLOSED' }),
      row({ repId: 'b-missed', state: 'MISSED' }),
      row({ repId: 'c-critical', state: 'CRITICAL' }),
      row({ repId: 'd-active', state: 'ACTIVE' }),
      row({ repId: 'e-at-risk', state: 'AT_RISK' }),
      row({ repId: 'f-not-started', state: 'NOT_STARTED' }),
      row({ repId: 'g-ready', state: 'READY_TO_CLOSE' }),
    ].sort(compareTeamRows)

    expect(rows.map((entry) => entry.state)).toEqual([
      'CRITICAL',
      'AT_RISK',
      'NOT_STARTED',
      'ACTIVE',
      'READY_TO_CLOSE',
      'CLOSED',
      'MISSED',
    ])
  })

  it('puts a rep who never checked in ahead of one who did', () => {
    const never = row({ repId: 'never', state: 'NOT_STARTED' })
    const checkedIn = row({ repId: 'checked', state: 'NOT_STARTED', checkInAt: '2026-10-30T04:05:00.000Z' })
    expect([checkedIn, never].sort(compareTeamRows)[0].repId).toBe('never')
  })

  it('puts more outstanding work first within a state', () => {
    const small = row({ repId: 'small', state: 'AT_RISK', requiredRemaining: 2 })
    const large = row({ repId: 'large', state: 'AT_RISK', requiredRemaining: 11 })
    expect([small, large].sort(compareTeamRows)[0].repId).toBe('large')
  })

  it('is a total order (severity is defined for every state)', () => {
    expect(Object.keys(STATE_PRIORITY)).toHaveLength(7)
    expect(new Set(Object.values(STATE_PRIORITY)).size).toBe(7)
  })
})

describe('COMMAND_CENTRE_GATE — escalation recovery', () => {
  it('records recovery when a critical rep improves', () => {
    expect(recoveredRepIds(['rep-1'], [], [])).toEqual(['rep-1'])
  })

  it('does not record recovery while the rep is still critical', () => {
    expect(recoveredRepIds(['rep-1'], [], ['rep-1'])).toEqual([])
  })

  it('records recovery only once', () => {
    expect(recoveredRepIds(['rep-1'], ['rep-1'], [])).toEqual([])
  })

  it('handles several reps independently', () => {
    expect(recoveredRepIds(['rep-1', 'rep-2', 'rep-3'], ['rep-2'], ['rep-3'])).toEqual(['rep-1'])
  })
})

describe('COMMAND_CENTRE_GATE — role enforcement', () => {
  it('the page refuses a rep', () => {
    const page = read('src/app/(app)/admin/command/page.tsx')
    expect(page).toContain('if (!ctx.isAdmin && !ctx.isManager) redirect')
  })

  it('the API refuses a rep, not only the navigation', () => {
    expect(read('src/app/api/admin/team-day/route.ts')).toContain('if (!ctx.isAdmin && !ctx.isManager)')
    expect(read('src/app/api/admin/team-day/[repId]/route.ts')).toContain('if (!ctx.isAdmin && !ctx.isManager)')
  })

  it('the detail loader scopes by role and organization', () => {
    const team = read('src/lib/rep-day/team.ts')
    expect(team).toContain("if (scope !== 'all' && !scope.has(repId)) throw new Error('Forbidden')")
    expect(team).toContain(".eq('organization_id', ctx.orgId)")
  })

  it('only admins may change the operating clock', () => {
    expect(read('src/app/api/admin/operating-policy/route.ts')).toContain('if (!ctx.isAdmin)')
  })
})

describe('COMMAND_CENTRE_GATE — one query wave, not one per rep', () => {
  it('loads the team with a single Promise.all and bounded scans', () => {
    const team = read('src/lib/rep-day/team.ts')
    expect(team).toContain('await Promise.all([')
    expect(team).toContain('SCAN_LIMIT')
    // No per-rep await inside the rep loop.
    const loop = team.slice(team.indexOf('for (const rep of repsResult.data'), team.indexOf('const counts ='))
    expect(loop).not.toContain('await ')
  })

  it('the page reads the canonical loader and does not derive status', () => {
    const page = read('src/app/(app)/admin/command/page.tsx')
    expect(page).toContain('loadTeamDay')
    expect(page).not.toContain('deriveRepDayState')
    expect(page).not.toContain('computePace')
  })
})

describe('COMMAND_CENTRE_GATE — operating policy editing', () => {
  it('accepts IANA zones and rejects nonsense', () => {
    expect(isValidTimeZone('Asia/Karachi')).toBe(true)
    expect(isValidTimeZone('America/New_York')).toBe(true)
    expect(isValidTimeZone('Europe/London')).toBe(true)
    expect(isValidTimeZone('Mars/Olympus')).toBe(false)
  })

  it('a reversed window is repaired before it reaches the database', () => {
    const policy = normalizePolicy({ workdayStart: '18:00', workdayEnd: '09:00' })
    expect(parseClock(policy.workdayStart)!).toBeLessThan(parseClock(policy.workdayEnd)!)
  })

  it('the editor is admin-only and posts the whole clock', () => {
    const component = read('src/components/admin/operating-hours.tsx')
    expect(component).toContain("fetch('/api/admin/operating-policy'")
    expect(component).toContain('timezone')
    expect(component).toContain('workingDays')
    expect(component).toContain('dailyResetTime')
    expect(read('src/app/(app)/settings/page.tsx')).toContain('{isAdmin && policy && <OperatingHours')
  })
})

describe('COMMAND_CENTRE_GATE — policy validation is not masked by normalisation', () => {
  const base = { timezone: 'Asia/Karachi', workdayStart: '09:00', workdayEnd: '18:00', workingDays: [1, 2, 3, 4, 5] }

  it('accepts the seeded policy', () => {
    expect(validatePolicyInput(base)).toBeNull()
  })

  it('rejects a workday that ends before it starts', () => {
    expect(validatePolicyInput({ ...base, workdayStart: '18:00', workdayEnd: '09:00' })).toBe(
      'The workday must start before it ends.',
    )
  })

  it('rejects an equal start and end', () => {
    expect(validatePolicyInput({ ...base, workdayStart: '09:00', workdayEnd: '09:00' })).toBe(
      'The workday must start before it ends.',
    )
  })

  it('rejects an unknown timezone', () => {
    expect(validatePolicyInput({ ...base, timezone: 'Mars/Olympus' })).toBe('Unknown timezone: Mars/Olympus')
  })

  it('rejects an empty working week', () => {
    expect(validatePolicyInput({ ...base, workingDays: [] })).toBe('At least one working day is required.')
  })

  it('rejects a day outside Sunday–Saturday', () => {
    expect(validatePolicyInput({ ...base, workingDays: [7] })).toBe(
      'Working days must be between Sunday (0) and Saturday (6).',
    )
  })

  it('rejects a malformed clock value', () => {
    expect(validatePolicyInput({ ...base, workdayStart: '9am' })).toBe(
      'Workday start and end must be valid times.',
    )
  })
})
