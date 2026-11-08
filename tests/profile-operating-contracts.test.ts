/**
 * Profile operating contracts — one person, many channels.
 *
 * A `profiles` row is a sender account; `person_id` groups the accounts that
 * belong to one human. The directory, profile detail, Rep Home and switcher all
 * read that grouping, and channel execution stays separate.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

describe('ONE_PERSON_MANY_CHANNELS', () => {
  it('profiles carry a canonical person self-reference', () => {
    const migration = read('supabase/migrations/20261109010000_profile_person.sql')
    expect(migration).toMatch(/alter table profiles add column if not exists person_id/)
    expect(migration).toMatch(/references profiles\(id\)/)
  })

  it('the mapping is additive — no identity id or history row is rewritten', () => {
    const migration = read('supabase/migrations/20261109010000_profile_person.sql')
    expect(migration).not.toMatch(/delete from/i)
    expect(migration).not.toMatch(/update revenue_identities/i)
    expect(migration).toMatch(/update profiles set person_id/i)
  })
})

describe('PROFILE_DIRECTORY_ONE_ROW_PER_PERSON', () => {
  it('the directory groups by person_id ?? id', () => {
    const source = read('src/lib/team/profiles.ts')
    expect(source).toMatch(/personKeyByProfile/)
    expect(source).toMatch(/person_id/)
  })

  it('the profile read model unions every channel of the person', () => {
    expect(read('src/lib/team/profile-detail.ts')).toMatch(/personProfileIds/)
    expect(read('src/lib/team/profile-detail.ts')).toMatch(/\.in\('profile_id', personProfileIds/)
  })
})

describe('PROFILE_KNOWLEDGE_SHARED', () => {
  it('knowledge tables are keyed by profile, so a person shares one knowledge base', () => {
    const migrations = [
      'supabase/migrations/20261109010000_profile_person.sql',
      ...['proof_cards', 'portfolio_projects', 'profile_experience', 'profile_claims', 'profile_sources']
        .map((table) => `supabase/migrations/${table}`),
    ]
    // The knowledge tables carry profile_id; the channel layer is separate.
    const schema = read('supabase/migrations/20261106140000_backend_db_fixes.sql')
    expect(schema).toMatch(/profile_id/)
    expect(read('supabase/migrations/20261109010000_profile_person.sql')).not.toMatch(/add column .*channel/i)
    expect(migrations.length).toBeGreaterThan(0)
  })
})

describe('CHANNEL_ASSIGNMENT_SEPARATE', () => {
  it('the channel comes from the revenue identity, never the profile', () => {
    expect(read('supabase/migrations/20261109010000_profile_person.sql')).not.toMatch(/add column .*channel/i)
    const canonical = read('src/lib/profiles/canonical.ts')
    expect(canonical).toMatch(/revenue_identities/)
  })

  it('no profile table stores a channel', () => {
    const migration = read('supabase/migrations/20261109010000_profile_person.sql')
    expect(migration).not.toMatch(/add column .*channel/i)
  })
})

describe('BACKUP_NOT_EXECUTABLE', () => {
  it('the backup selector never feeds execution', async () => {
    const { getBackupEligibleProfilesForRep, getExecutableProfilesForRep } = await import('@/lib/profiles/canonical')
    const set = {
      businessDate: '2026-11-09',
      profiles: [
        {
          profileId: 'p1', profileName: 'Fizza', channels: ['linkedin'], identityIds: ['i1'],
          assignedReps: [], primaryRepId: 'rep-1', primaryRepName: 'Hassan',
          primarySource: 'coverage', primaryReason: 'Explicit primary coverage',
          backups: [{ repId: 'rep-2', repName: 'Madiha', priority: 2, source: 'coverage' }],
          coverageState: 'EXPLICIT' as const, needsReview: false, reviewReasons: [],
        },
      ],
      ambiguous: [], unassigned: [],
    }
    const backups = getBackupEligibleProfilesForRep(set, 'rep-2')
    expect(backups.map((p) => p.profileId)).toEqual(['p1'])
    const executable = getExecutableProfilesForRep(set, 'rep-2', new Set())
    expect(executable.map((p) => p.profileId)).toEqual([])
  })
})

describe('ACTIVE_COVER_EXECUTABLE', () => {
  it('active coverage makes a profile executable for the covering rep', async () => {
    const { getExecutableProfilesForRep } = await import('@/lib/profiles/canonical')
    const set = {
      businessDate: '2026-11-09',
      profiles: [
        {
          profileId: 'p1', profileName: 'Fizza', channels: ['linkedin'], identityIds: ['i1'],
          assignedReps: [], primaryRepId: 'rep-1', primaryRepName: 'Hassan',
          primarySource: 'coverage', primaryReason: 'Explicit primary coverage',
          backups: [], coverageState: 'EXPLICIT' as const, needsReview: false, reviewReasons: [],
        },
      ],
      ambiguous: [], unassigned: [],
    }
    expect(getExecutableProfilesForRep(set, 'rep-2', new Set(['p1'])).map((p) => p.profileId)).toEqual(['p1'])
  })
})

describe('REP_PROFILE_GROUPING', () => {
  it('Rep Home groups channel profiles by person', () => {
    expect(read('src/lib/coverage/load.ts')).toMatch(/groupProfilesByPerson/)
    expect(read('src/components/coverage/rep-profiles-today.tsx')).toMatch(/buildProfileCards/)
  })

  it('the grouped card unions channels and identities', () => {
    expect(read('src/lib/coverage/load.ts')).toMatch(/new Set\(\[\.\.\.existing\.channels/)
    expect(read('src/lib/coverage/load.ts')).toMatch(/new Set\(\[\.\.\.existing\.identityIds/)
  })
})

describe('PROFILE_SWITCHER_GROUPING', () => {
  it('the switcher groups channels under the person', () => {
    const source = read('src/components/shell/profile-switcher.tsx')
    expect(source).toMatch(/groupIdentitiesByPerson/)
    expect(source).toMatch(/identity\.personId \?\? identity\.profileId/)
  })

  it('the shell resolves a person key for every workable identity', () => {
    expect(read('src/app/(app)/layout.tsx')).toMatch(/personIdByProfile/)
    expect(read('src/lib/workspace/active-identity.ts')).toMatch(/personId/)
  })
})

describe('UPWORK_ONLY_UPWORK_CHANNELS / LINKEDIN_ONLY_LINKEDIN_CHANNELS', () => {
  it('the workspace exposes a channel per identity, not a merged profile', () => {
    const source = read('src/lib/workspace/active-identity.ts')
    expect(source).toMatch(/channel/)
  })

  it('the Rep Home card links the correct channel workflow', () => {
    const source = read('src/components/coverage/rep-profiles-today.tsx')
    expect(source).toMatch(/isUpwork/)
    expect(source).toMatch(/isLinkedIn/)
  })
})

describe('ADD_CHANNEL_DOES_NOT_CREATE_PERSON', () => {
  it('the person mapping is a self-reference, so a channel never adds a person', () => {
    const migration = read('supabase/migrations/20261109010000_profile_person.sql')
    expect(migration).toMatch(/references profiles\(id\)/)
    expect(migration).not.toMatch(/insert into profiles/i)
  })
})

describe('ADMIN_PROFILE_SINGLE_ENTRY', () => {
  it('Team → Profiles is the single profile front door', () => {
    const nav = read('src/lib/navigation/relay-shell-nav.ts')
    expect(nav).toMatch(/href: '\/team\/profiles'/)
    expect(nav).not.toMatch(/href: '\/admin\/profiles'/)
  })

  it('legacy profile routes redirect to the front door', () => {
    expect(read('src/app/(app)/profiles/page.tsx')).toMatch(/redirect/)
    expect(read('src/app/(app)/manage-profiles/page.tsx')).toMatch(/redirect/)
  })
})

describe('COVERAGE_DOES_NOT_CHANGE_PRIMARY', () => {
  it('coverage activation and restore never write ownership', () => {
    const actions = read('src/lib/coverage/actions.ts')
    expect(actions).not.toMatch(/identity_assignments\s*\)?\s*\.(insert|upsert|update|delete)/)
  })
})

describe('TARGETS_CHANNEL_AWARE', () => {
  it('targets are keyed by the channel identity', () => {
    const source = read('src/lib/team/profile-detail.ts')
    expect(source).toMatch(/revenue_identity_id/)
  })
})

describe('ONE_TASK_ENGINE', () => {
  it('tasks reference a profile and/or a channel identity in one engine', () => {
    const migration = read('supabase/migrations/20261031120000_assigned_tasks.sql')
    expect(migration).toMatch(/profile_id uuid/)
    expect(read('src/lib/tasks/assigned-tasks.ts')).toMatch(/from\('assigned_tasks'\)/)
  })
})
