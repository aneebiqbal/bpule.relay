/**
 * Closure contracts for the five previously open P1 findings.
 *
 * SR-U3 / SR-U8: every personal target must come from the ONE canonical rule
 * (`lanePersonalTarget`) so Rep Today, People, Profiles and Performance agree.
 * SR-U5: people/coverage/knowledge management accepts MANAGE_REVENUE_IDENTITIES
 * while target editing stays on MANAGE_TEAM_TARGETS.
 * SR-U6: setup flows never claim a target write they were not allowed to make.
 * SR-U1: Upwork history logging is labelled honestly and never appends optimistically.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { lanePersonalTarget } from '@/lib/execution/accountability'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

describe('PERSONAL_TARGET_ONE_RULE', () => {
  const lane = (over: Partial<Parameters<typeof lanePersonalTarget>[0]> = {}) => ({
    targetCount: 20,
    seats: ['rep-a'],
    allocations: [],
    ...over,
  })

  it('an explicit allocation wins over the lane target', () => {
    expect(lanePersonalTarget(lane({ seats: ['rep-a', 'rep-b'], allocations: [{ repId: 'rep-a', targetCount: 7 }] }), 'rep-a')).toBe(7)
    expect(lanePersonalTarget(lane({ seats: ['rep-a', 'rep-b'] }), 'rep-b')).toBe(0)
  })

  it('a solo seat carries the whole lane target', () => {
    expect(lanePersonalTarget(lane({ seats: ['rep-a'] }), 'rep-a')).toBe(20)
  })

  it('a shared unallocated lane gives nobody a personal expectation', () => {
    expect(lanePersonalTarget(lane({ seats: ['rep-a', 'rep-b'] }), 'rep-a')).toBe(0)
    expect(lanePersonalTarget(lane({ seats: ['rep-a', 'rep-b'] }), 'rep-b')).toBe(0)
  })

  it('a rep without a seat gets nothing even on an unallocated lane', () => {
    expect(lanePersonalTarget(lane({ seats: [] }), 'rep-z')).toBe(0)
  })
})

describe('REP360_USES_CANONICAL_PERSONAL_TARGET', () => {
  it('the operating plan delegates instead of recomputing the basis', () => {
    const source = read('src/lib/operations/rep-operating-plan.ts')
    expect(source).toContain('lanePersonalTarget(')
    expect(source).toContain('personalTarget')
    expect(source).toContain('profileTarget')
  })

  it('Performance → Targets delegates instead of dumping the lane on the primary', () => {
    const source = read('src/lib/operations/targets.ts')
    expect(source).toContain('lanePersonalTarget(')
    expect(source).not.toContain("seat.role === 'PRIMARY')?.rep_id ?? 'unassigned'")
  })
})

describe('PROFILE_DETAIL_CAPABILITY_SPLIT', () => {
  it('detail page uses the same capability as the list for people/coverage', () => {
    const page = read('src/app/(app)/team/profiles/[profileId]/page.tsx')
    expect(page).toContain("can(ctx, 'MANAGE_REVENUE_IDENTITIES')")
    expect(page).toContain("can(ctx, 'MANAGE_TEAM_TARGETS')")
  })

  it('target editing is gated separately from people management', () => {
    const view = read('src/components/team/team-profile-detail.tsx')
    expect(view).toContain('canManageTargets && (\n          <ChannelTargetsEditor')
  })
})

describe('SETUP_TARGET_WRITES_ARE_HONEST', () => {
  it('/team forwards the separate target capability', () => {
    const page = read('src/app/(app)/team/page.tsx')
    expect(page).toContain("canManageTargets={ctx.auth.capabilities.has('MANAGE_TEAM_TARGETS')}")
  })

  it('setup assistant never attempts a forbidden target write', () => {
    const source = read('src/components/team/setup-assistant.tsx')
    expect(source).toContain('if (!canManageTargets)')
    expect(source).toContain('MANAGE_TEAM_TARGETS required')
  })

  it('Rep360 reports target failures instead of closing as success', () => {
    const source = read('src/components/team/rep-operating-plan.tsx')
    expect(source).toContain('Responsibility saved, but targets were not')
  })
})

describe('UPWORK_HISTORY_IS_LABELLED_HONESTLY', () => {
  it('logging waits for success before appending and surfaces failures', () => {
    const source = read('src/components/upwork-communication.tsx')
    expect(source).toContain('if (!res.ok) throw new Error')
    expect(source).toContain('setLogError')
    expect(source).not.toContain('Save & send')
  })

  it('the follow-up prompt does not claim Relay sent the message', () => {
    const source = read('src/components/upwork-job-actions.tsx')
    expect(source).not.toContain('(sent on Upwork):')
    expect(source).toContain('send it on Upwork yourself')
  })
})
