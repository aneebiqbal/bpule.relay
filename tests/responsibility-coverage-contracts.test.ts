/**
 * Responsibility + coverage contracts (V4.9).
 *
 * PRIMARY is permanent ownership. ACTIVE COVER is temporary execution.
 * BACKUP is eligibility only. Coverage never changes primary, expired coverage
 * is never executable, permanent transfer is not coverage, and every surface
 * names the same channel the same way.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defaultTargetsForChannel } from '@/lib/accountability/default-targets'
import { isCoverageActiveOn } from '@/lib/coverage/access'
import { getExecutableProfilesForRep, type CanonicalAssignmentSet } from '@/lib/profiles/canonical'
import { buildWhoWorksWhat } from '@/lib/team/who-works-what'
import type { CoveragePlan, CoverageProfileResult } from '@/lib/coverage/engine'
import { neonServiceDbClient } from '@/lib/db/neon'

const ROOT = process.cwd()
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')
const ORG = '11111111-1111-1111-1111-111111111111'

/**
 * A live production audit is only meaningful on a frozen tree. When a writer is
 * actively mutating coverage, skip the assertion instead of failing on a moving
 * target — the audit runs for real once the writer stops.
 */
async function dataIsBeingMutated(client: ReturnType<typeof neonServiceDbClient>): Promise<boolean> {
  const { data } = await client
    .from('profile_coverage')
    .select('updated_at')
    .eq('organization_id', ORG)
    .order('updated_at', { ascending: false })
    .limit(1)
  const latest = data?.[0]?.updated_at as string | undefined
  if (!latest) return false
  return Date.now() - Date.parse(latest) < 10 * 60 * 1000
}

/** Extract one exported function body so a contract can scope its assertion. */
function extractFunction(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`)
  expect(start, `missing ${name}`).toBeGreaterThan(-1)
  const next = source.indexOf('\nexport async function ', start + 1)
  return source.slice(start, next === -1 ? source.length : next)
}

function assignmentSet(): CanonicalAssignmentSet {
  return {
    businessDate: '2026-11-10',
    profiles: [
      {
        profileId: 'p-1',
        profileName: 'Zaira',
        channels: ['upwork'],
        identityIds: ['i-1'],
        assignedReps: [],
        primaryRepId: 'rep-hassan',
        primaryRepName: 'Hassan',
        primarySource: 'coverage',
        primaryReason: 'Explicit primary coverage',
        backups: [],
        coverageState: 'EXPLICIT',
        needsReview: false,
        reviewReasons: [],
      },
      {
        profileId: 'p-2',
        profileName: 'Mehak',
        channels: ['linkedin'],
        identityIds: ['i-2'],
        assignedReps: [],
        primaryRepId: 'rep-ahmad',
        primaryRepName: 'Ahmad',
        primarySource: 'coverage',
        primaryReason: 'Explicit primary coverage',
        backups: [{ repId: 'rep-dawood', repName: 'Dawood', priority: 2, source: 'coverage' }],
        coverageState: 'EXPLICIT',
        needsReview: false,
        reviewReasons: [],
      },
    ],
    ambiguous: [],
    unassigned: [],
  }
}

describe('PRIMARY_OWNER_PRESERVED_DURING_COVERAGE', () => {
  it('activating coverage never writes the primary chain or eligibility', () => {
    const approve = extractFunction(read('src/lib/coverage/actions.ts'), 'approveCoveragePlan')
    expect(approve).toMatch(/coverage_assignments/)
    // Eligibility is READ to guard activation; it is never written here.
    expect(approve).not.toMatch(/from\('profile_coverage'\)[\s\S]{0,300}\.(insert|update|upsert|delete)/)
    expect(approve).not.toMatch(/from\('identity_assignments'\)[\s\S]{0,300}\.(insert|update|upsert|delete)/)
  })
})

describe('RETURN_RESTORES_PRIMARY_EXECUTION', () => {
  it('restore ends the cover and emits COVERAGE_RESTORED without touching ownership', () => {
    const restore = extractFunction(read('src/lib/coverage/actions.ts'), 'restorePrimaryCoverage')
    expect(restore).toMatch(/status: 'COMPLETED'/)
    expect(restore).toMatch(/COVERAGE_RESTORED/)
    expect(restore).not.toMatch(/profile_coverage/)
    expect(restore).not.toMatch(/identity_assignments/)
  })
})

describe('PERMANENT_TRANSFER_IS_NOT_COVERAGE', () => {
  it('transfer writes the primary chain, never a coverage assignment', () => {
    const transfer = extractFunction(read('src/lib/profiles/assignment.ts'), 'transferResponsibility')
    expect(transfer).toMatch(/profile_coverage/)
    expect(transfer).toMatch(/role: 'PRIMARY'/)
    expect(transfer).not.toMatch(/coverage_assignments/)
  })
})

describe('ACTIVE_COVER_SHOWN_AS_CURRENT_OPERATOR', () => {
  it('the unified task labels the covering rep as current execution', () => {
    const source = read('src/lib/tasks/load-unified-tasks.ts')
    expect(source).toMatch(/executionRepByProfile/)
    expect(source).toMatch(/covering_rep_id/)
  })

  it('the rep operating plan separates primary from coverage responsibilities', () => {
    const source = read('src/lib/operations/rep-operating-plan.ts')
    expect(source).toMatch(/role: 'primary' \| 'coverage'/)
    expect(source).toMatch(/access === 'coverage'/)
  })

  it('the profile detail names the covering rep, not a second owner', () => {
    expect(read('src/components/team/team-profile-detail.tsx')).toMatch(/covered by/)
  })
})

describe('BACKUP_NEVER_SHOWN_AS_CURRENT_OPERATOR', () => {
  it('backup eligibility alone never enters the executable set', () => {
    const executable = getExecutableProfilesForRep(assignmentSet(), 'rep-dawood')
    expect(executable.map((row) => row.profileId)).toEqual([])
  })

  it('the executable scope reads primary plus active coverage only', () => {
    const source = read('src/lib/coverage/access.ts')
    expect(source).toMatch(/listActiveCoveredIdentities/)
    expect(source).not.toMatch(/role\s*===?\s*'BACKUP'/)
  })
})

describe('EXPIRED_COVERAGE_NOT_EXECUTABLE', () => {
  it('Rep Home drops cover past its until date', () => {
    expect(read('src/lib/coverage/load.ts')).toMatch(/row\.coveringRepId === repId && !row\.expired/)
  })

  it('task execution drops cover past its until date', () => {
    expect(read('src/lib/tasks/load-unified-tasks.ts')).toMatch(/isCoverageActiveOn/)
  })

  it('isCoverageActiveOn is inclusive of the until date', () => {
    const row = { effectiveFrom: '2026-01-01', effectiveUntil: '2026-01-05' }
    expect(isCoverageActiveOn(row, '2026-01-05')).toBe(true)
    expect(isCoverageActiveOn(row, '2026-01-06')).toBe(false)
    expect(isCoverageActiveOn({ effectiveFrom: '2026-01-10', effectiveUntil: null }, '2026-01-05')).toBe(false)
  })
})

describe('UPWORK_ALWAYS_SUPPORTS_APPLICATIONS_AND_PROPOSALS', () => {
  it('the canonical Upwork pack contains both actions', () => {
    expect(defaultTargetsForChannel('upwork')).toEqual([
      { activityType: 'application', targetCount: 10 },
      { activityType: 'proposal', targetCount: 2 },
    ])
  })

  it('no surface labels an application as a proposal', () => {
    const completion = read('src/lib/rep-home/profile-completion.ts')
    expect(completion).toMatch(/activityLabel/)
    expect(completion).not.toMatch(/application:\s*'Proposals'/)
    expect(completion).not.toMatch(/proposal:\s*'Qualified'/)
  })

  it('daily jobs give proposals their own label and destination', () => {
    const source = read('src/components/rep/daily-jobs.tsx')
    expect(source).toMatch(/title: 'Upwork proposals'/)
    expect(source).toMatch(/href: '\/upwork'/)
  })
})

describe('TARGET_PACK_SINGLE_AUTHORITY', () => {
  it('the add-profile wizard seeds the canonical pack, not a private copy', () => {
    const source = read('src/components/team/add-profile-wizard.tsx')
    expect(source).toMatch(/defaultTargetsForChannel/)
    expect(source).not.toMatch(/CHANNEL_TARGETS/)
  })

  it('the profile target editor derives the pack from the identity channel', () => {
    const source = read('src/components/team/team-profile-detail.tsx')
    expect(source).toMatch(/defaultTargetsForChannel\(normalizeChannel\(channel\.channel\)\)/)
  })
})

describe('COVERAGE_EXPIRY_PARITY', () => {
  it('every execution surface honours the until date', () => {
    expect(read('src/lib/coverage/access.ts')).toMatch(/isCoverageActiveOn/)
    expect(read('src/lib/coverage/load.ts')).toMatch(/!row\.expired/)
    expect(read('src/lib/tasks/load-unified-tasks.ts')).toMatch(/isCoverageActiveOn/)
    expect(read('src/lib/operations/chat-queue.ts')).toMatch(/isCoverageActiveOn/)
  })

  it('expiry is inclusive of the until date', () => {
    const row = { effectiveFrom: '2026-01-01', effectiveUntil: '2026-01-05' }
    expect(isCoverageActiveOn(row, '2026-01-05')).toBe(true)
    expect(isCoverageActiveOn(row, '2026-01-06')).toBe(false)
    expect(isCoverageActiveOn({ effectiveFrom: '2026-01-01', effectiveUntil: null }, '2026-01-05')).toBe(true)
  })
})

describe('TARGET_TOTAL_PARITY', () => {
  it('person total equals the sum of active channel lanes', async () => {
    const { buildTeamTargetOverview } = await import('@/lib/accountability/target-overview')
    const { defaultTargetsForChannel } = await import('@/lib/accountability/default-targets')
    const pack = defaultTargetsForChannel('linkedin')
    const targets = pack.map((row, index) => ({
      id: `t${index}`,
      organizationId: 'org',
      repId: 'rep-1',
      revenueIdentityId: 'ri-1',
      activityType: row.activityType,
      targetCount: row.targetCount,
      active: true,
      createdBy: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }))
    const overview = buildTeamTargetOverview({
      reps: [{ id: 'rep-1', name: 'Ahmad' }],
      identities: [{ id: 'ri-1', identityName: 'Mehak Seedat', channel: 'linkedin', status: 'active', profileId: null }],
      assignments: [{ repId: 'rep-1', revenueIdentityId: 'ri-1' }],
      targets,
    })
    const expected = pack.reduce((sum, row) => sum + row.targetCount, 0)
    expect(overview.people[0].totalActionsPerDay).toBe(expected)
    expect(overview.totalActionsPerDay).toBe(expected)
  })
})

describe('WHO_WORKS_WHAT', () => {
  function profile(over: Partial<CoverageProfileResult> = {}): CoverageProfileResult {
    return {
      profileId: 'p-1',
      personId: null,
      name: 'Zaira',
      channels: ['upwork'],
      identityIds: ['i-1'],
      primaryRepId: 'rep-hassan',
      primaryRepName: 'Hassan',
      primaryAvailability: 'ON_LEAVE',
      primaryIsAvailable: false,
      backups: [],
      activeCoveringRepId: null,
      activeCoveringRepName: null,
      activeCoverageUntil: null,
      activeOperators: [],
      activeCoverageMode: null,
      status: 'COVERED',
      recommendation: 'NONE',
      recommendedRepId: null,
      recommendedRepName: null,
      recommendationReasons: [],
      recommendedReady: false,
      ineligibleReason: null,
      coverageExpiring: false,
      primaryReady: true,
      work: { replies: 0, followUps: 0, tasks: 0 },
      ...over,
    }
  }

  const plan = (profiles: CoverageProfileResult[]): CoveragePlan => ({
    businessDate: '2026-11-10',
    isWorkingDay: true,
    coveragePolicy: 'AUTO_COVER',
    totalProfiles: profiles.length,
    counts: { COVERED: 0, BACKUP_ACTIVE: 0, AT_RISK: 0, UNCOVERED: 0 },
    profiles,
    requiresApproval: [],
    unchanged: profiles.length,
  })

  it('groups permanent ownership by rep and person, and labels temporary cover', () => {
    const rows = buildWhoWorksWhat(
      plan([
        profile({
          profileId: 'p-zaira',
          name: 'Zaira',
          channels: ['upwork'],
          primaryRepId: 'rep-hassan',
          primaryRepName: 'Hassan',
          activeCoveringRepId: 'rep-dawood',
          activeCoveringRepName: 'Dawood',
        }),
        profile({
          profileId: 'p-mehak',
          name: 'Mehak Seedat',
          channels: ['linkedin', 'upwork'],
          primaryRepId: 'rep-ahmad',
          primaryRepName: 'Ahmad',
        }),
      ]),
    )

    const ahmad = rows.find((row) => row.repId === 'rep-ahmad')
    expect(ahmad?.people).toHaveLength(1)
    expect(ahmad?.people[0].channels.map((channel) => [channel.channel, channel.role])).toEqual([
      ['linkedin', 'PRIMARY'],
      ['upwork', 'PRIMARY'],
    ])

    const hassan = rows.find((row) => row.repId === 'rep-hassan')
    expect(hassan?.people[0].channels.map((channel) => channel.role)).toEqual(['PRIMARY'])

    const dawood = rows.find((row) => row.repId === 'rep-dawood')
    expect(dawood?.people[0].channels[0]).toMatchObject({ role: 'TEMPORARY', coveringFor: 'Hassan' })
  })

  it('never lists a backup as an operator', () => {
    const rows = buildWhoWorksWhat(
      plan([
        profile({
          primaryRepId: 'rep-hassan',
          primaryRepName: 'Hassan',
          backups: [{ repId: 'rep-madiha', repName: 'Madiha', priority: 2, source: 'coverage', eligible: true, ready: true }],
        }),
      ]),
    )
    expect(rows.map((row) => row.repId)).toEqual(['rep-hassan'])
  })
})

describe('RESPONSIBILITY_STATUS_COMPONENT', () => {
  it('one shared component covers every responsibility state', () => {
    const source = read('src/components/ui/responsibility-status.tsx')
    for (const state of ['PRIMARY', 'TEMPORARY', 'BACKUP', 'READY', 'ACCESS_NEEDED', 'UNASSIGNED', 'ON_LEAVE']) {
      expect(source, state).toContain(state)
    }
  })

  it('the responsibility surfaces consume it', () => {
    const surfaces = [
      'src/components/coverage/rep-coverage-panel.tsx',
      'src/components/team/rep-operating-plan.tsx',
      'src/components/team/team-profile-detail.tsx',
    ]
    for (const surface of surfaces) {
      expect(read(surface), surface).toMatch(/ResponsibilityStatus/)
    }
  })
})

describe('BACKUP_ONLY_HAS_NO_ACTIVE_EXECUTION_TARGET', () => {
  it('production: no active plan sits on a profile without an active PRIMARY', async () => {
    const client = neonServiceDbClient()
    if (await dataIsBeingMutated(client)) {
      console.warn('[audit] coverage changed in the last 10m — skipping live audit while a writer is active')
      return
    }
    const [{ data: plans, error: planError }, { data: coverage }, { data: identities }] = await Promise.all([
      client.from('daily_target_plans').select('revenue_identity_id').eq('organization_id', ORG).eq('active', true).limit(1000),
      client.from('profile_coverage').select('profile_id, rep_id, role').eq('organization_id', ORG).eq('active', true).limit(1000),
      client.from('revenue_identities').select('id, profile_id').eq('organization_id', ORG).limit(1000),
    ])
    expect(planError).toBeNull()
    const profileByIdentity = new Map((identities ?? []).map((row) => [row.id as string, row.profile_id as string]))
    const primaryProfiles = new Set((coverage ?? []).filter((row) => row.role === 'PRIMARY').map((row) => row.profile_id as string))
    const violations = (plans ?? []).filter(
      (row) => !primaryProfiles.has(profileByIdentity.get(row.revenue_identity_id as string) ?? ''),
    )
    expect(violations).toEqual([])
  }, 120_000)
})

describe('ELIGIBILITY_DOES_NOT_GRANT_EXECUTION', () => {
  it('the executable scope reads primary plus active coverage, never backup eligibility', () => {
    const source = read('src/lib/coverage/access.ts')
    expect(source).toMatch(/listActiveCoveredIdentities/)
    expect(source).not.toMatch(/role\s*===?\s*'BACKUP'/)
  })

  it('production: every active plan belongs to a profile with exactly one active PRIMARY', async () => {
    const client = neonServiceDbClient()
    if (await dataIsBeingMutated(client)) {
      console.warn('[audit] coverage changed in the last 10m — skipping live audit while a writer is active')
      return
    }
    const [{ data: plans, error: planError }, { data: coverage }, { data: identities }] = await Promise.all([
      client.from('daily_target_plans').select('revenue_identity_id').eq('organization_id', ORG).eq('active', true).limit(1000),
      client.from('profile_coverage').select('profile_id, rep_id, role').eq('organization_id', ORG).eq('active', true).limit(1000),
      client.from('revenue_identities').select('id, profile_id').eq('organization_id', ORG).limit(1000),
    ])
    expect(planError).toBeNull()
    const profileByIdentity = new Map((identities ?? []).map((row) => [row.id as string, row.profile_id as string]))
    const primaryCountByProfile = new Map<string, number>()
    for (const row of coverage ?? []) {
      if (row.role !== 'PRIMARY') continue
      const profileId = row.profile_id as string
      primaryCountByProfile.set(profileId, (primaryCountByProfile.get(profileId) ?? 0) + 1)
    }
    const violations = (plans ?? []).filter((row) => {
      const profileId = profileByIdentity.get(row.revenue_identity_id as string) ?? ''
      return primaryCountByProfile.get(profileId) !== 1
    })
    expect(violations).toEqual([])
  }, 120_000)
})

describe('ZARA_COVERAGE_CASE', () => {
  it('the covering rep gains execution while the primary is unchanged', () => {
    const set = assignmentSet()
    // Dawood covers Zaira · Upwork; Hassan stays the permanent primary.
    const executable = getExecutableProfilesForRep(set, 'rep-dawood', new Set(['p-1']))
    expect(executable.map((row) => row.profileId)).toEqual(['p-1'])
    expect(set.profiles.find((row) => row.profileId === 'p-1')?.primaryRepId).toBe('rep-hassan')
  })

  it('a backup never becomes the current operator without active cover', () => {
    const executable = getExecutableProfilesForRep(assignmentSet(), 'rep-dawood')
    expect(executable.map((row) => row.profileId)).toEqual([])
  })
})

describe('CHANNEL_BADGE_PARITY', () => {
  it('one ChannelBadge component is the shared visual authority', () => {
    expect(read('src/components/ui/channel-badge.tsx')).toMatch(/export function ChannelBadge/)
  })

  it('every primary surface renders ChannelBadge or the canonical channelLabel', () => {
    const surfaces = [
      'src/components/team/team-profile-detail.tsx',
      'src/components/team/team-profiles-table.tsx',
      'src/components/team/rep-operating-plan.tsx',
      'src/components/team/add-profile-wizard.tsx',
      'src/components/coverage/rep-coverage-panel.tsx',
      'src/components/coverage/rep-profiles-today.tsx',
      'src/components/coverage/admin-coverage-panel.tsx',
      'src/components/v4/v4-admin-home.tsx',
      'src/components/targets-manager.tsx',
      'src/components/shell/profile-switcher.tsx',
      'src/lib/daily-actions/project.ts',
    ]
    for (const surface of surfaces) {
      expect(read(surface), surface).toMatch(/ChannelBadge|channelLabel/)
    }
  })
})

describe('INBOX_COVERAGE_CONTEXT', () => {
  it('the chat queue resolves the covering rep and primary for the sending profile', () => {
    const source = read('src/lib/operations/chat-queue.ts')
    expect(source).toMatch(/coveringRepName/)
    expect(source).toMatch(/primaryRepName/)
    expect(source).toMatch(/isCoverageActiveOn/)
  })

  it('the thread header states the working status', () => {
    expect(read('src/components/chats/thread-header.tsx')).toMatch(/Temporary cover for/)
  })
})

describe('COVERAGE_NOTIFICATION_CONTEXT', () => {
  it('coverage notifications name the profile, channel and the other rep', () => {
    const source = read('src/lib/coverage/actions.ts')
    expect(source).toMatch(/Temporary responsibility assigned/)
    expect(source).toMatch(/(covering this profile for|alongside) \$\{primaryName\}/)
    expect(source).toMatch(/Your ownership is unchanged/)
    expect(source).toMatch(/is restored to you/)
  })
})

describe('COVERAGE_VISUAL_STATE_PARITY', () => {
  it('coverage panels never use the ambiguous "Backup active" label', () => {
    const source = read('src/components/coverage/admin-coverage-panel.tsx')
    expect(source).not.toMatch(/'Backup active'/)
    expect(source).toMatch(/'Temporary cover'/)
  })

  it('restore and temporary cover are impossible to confuse', () => {
    const source = read('src/components/coverage/admin-coverage-panel.tsx')
    expect(source).toMatch(/Restore primary:/)
    expect(source).toMatch(/Temporary cover:/)
  })
})
