/**
 * Task execution contracts.
 *
 * The task system is the central execution layer: one canonical work item,
 * linked to a lead/profile without owning either, with an internal conversation
 * kept separate from the system event log. A transfer moves work; it never
 * moves lead ownership or profile ownership.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { classifyUnifiedTaskTab, isOpenTask } from '@/lib/tasks/rank-unified-tasks'
import { toUnifiedTaskFromAssigned } from '@/lib/tasks/map-unified-task'
import type { AssignedTaskRow } from '@/lib/tasks/types'
import type { CanonicalProfileAssignment } from '@/lib/profiles/canonical'

const ROOT = process.cwd()
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

function assigned(over: Partial<AssignedTaskRow> = {}): AssignedTaskRow {
  return {
    id: 't-1',
    organization_id: 'org-1',
    assignee_rep_id: 'rep-a',
    created_by_rep_id: 'mgr-1',
    lead_id: null,
    profile_id: null,
    kind: 'CUSTOM',
    title: 'General work',
    description: null,
    priority: 'NORMAL',
    due_at: null,
    status: 'OPEN',
    waiting_on: null,
    transfer_requested_by: null,
    transfer_requested_to: null,
    transfer_reason: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null,
    cancelled_at: null,
    cancel_reason: null,
    previous_assignee_rep_id: null,
    ...over,
  }
}

describe('TASK_GENERAL_ASSIGNMENT', () => {
  it('a task may exist with no lead and no profile', () => {
    const task = toUnifiedTaskFromAssigned(assigned())
    expect(task.leadId).toBeNull()
    expect(task.profileId).toBeNull()
    expect(task.source).toBe('ASSIGNED')
  })

  it('creation never requires lead_id or profile_id', () => {
    const source = read('src/lib/tasks/assigned-tasks.ts')
    expect(source).toMatch(/leadId\?: string \| null/)
    expect(source).toMatch(/profileId\?: string \| null/)
    expect(source).not.toMatch(/if \(!input\.leadId\) throw/)
  })
})

describe('TASK_LEAD_LINK', () => {
  it('the task stores a lead link and the list API filters by it', () => {
    expect(read('supabase/migrations/20261031120000_assigned_tasks.sql')).toMatch(
      /lead_id uuid references leads\(id\) on delete set null/,
    )
    expect(read('src/app/api/tasks/route.ts')).toMatch(/leadId/)
  })

  it('a lead-linked task opens the lead, not a bare task page', () => {
    const task = toUnifiedTaskFromAssigned(assigned({ lead_id: 'lead-9' }))
    expect(task.leadId).toBe('lead-9')
    expect(task.action.href).toBe('/leads/lead-9')
  })
})

describe('TASK_PROFILE_LINK', () => {
  it('a profile-linked task carries canonical primary + current execution', () => {
    const task = toUnifiedTaskFromAssigned(assigned({ profile_id: 'p-1' }), {
      profileName: 'Hassan · LinkedIn',
      primaryRepName: 'Dawood',
      executionRepName: 'Madiha',
    })
    expect(task.profileId).toBe('p-1')
    expect(task.primaryRepName).toBe('Dawood')
    expect(task.executionRepName).toBe('Madiha')
  })

  it('the loader reads the coverage chain, never the raw assignment table', () => {
    const source = read('src/lib/tasks/load-unified-tasks.ts')
    expect(source).toMatch(/profile_coverage/)
    expect(source).toMatch(/coverage_assignments/)
    expect(source).not.toMatch(/identity_assignments/)
  })
})

describe('TASK_COMMENT_THREAD', () => {
  it('comments live on internal_notes for the TASK subject', () => {
    expect(read('supabase/migrations/20261101120000_operations_workspace.sql')).toMatch(
      /subject_type in \('LEAD', 'ACCOUNT', 'REP', 'TASK'\)/,
    )
    expect(read('src/lib/operations/notes.ts')).toMatch(/subjectType === 'TASK'/)
  })

  it('the task detail renders the conversation panel', () => {
    const drawer = read('src/components/tasks/task-detail-drawer.tsx')
    expect(drawer).toMatch(/NotesPanel/)
    expect(drawer).toMatch(/subjectType="TASK"/)
  })
})

describe('TASK_EVENT_SEPARATION', () => {
  it('task_events carries no comment body', () => {
    const sql = read('supabase/migrations/20261031120000_assigned_tasks.sql')
    const events = sql.slice(sql.indexOf('create table if not exists task_events'))
    expect(events).not.toMatch(/\bbody\b/)
  })

  it('the drawer keeps conversation and activity in separate sections', () => {
    const drawer = read('src/components/tasks/task-detail-drawer.tsx')
    expect(drawer.indexOf('NotesPanel')).toBeLessThan(drawer.indexOf('Task activity'))
  })
})

describe('TASK_REASSIGNMENT', () => {
  it('reassignment records who held it, why, and notifies both reps', () => {
    const source = read('src/lib/tasks/assigned-tasks.ts')
    expect(source).toMatch(/previous_assignee_rep_id: previous/)
    expect(source).toMatch(/reason: reason \?\? null/)
    expect(source).toMatch(/task_transferred_away/)
  })

  it('the API accepts a reassignment reason', () => {
    expect(read('src/app/api/tasks/[id]/route.ts')).toMatch(/reassignAssignedTask\(client, auth, id, assigneeRepId, reason/)
  })
})

describe('TASK_TRANSFER_PRESERVES_HISTORY', () => {
  it('a transfer never rewrites creator, creation time or the event log', () => {
    const source = read('src/lib/tasks/assigned-tasks.ts')
    const reassign = source.slice(source.indexOf('export async function reassignAssignedTask'))
    const body = reassign.slice(0, reassign.indexOf('export async function'))
    expect(body).not.toMatch(/created_by_rep_id:/)
    expect(body).not.toMatch(/created_at:/)
    expect(body).not.toMatch(/delete\(/)
  })

  it('the pending transfer is cleared only by the canonical reassign path', () => {
    expect(read('src/lib/tasks/assigned-tasks.ts')).toMatch(/transfer_requested_to: null/)
  })
})

describe('TASK_PROFILE_BOUND_COVERAGE_HANDOFF', () => {
  it('coverage moves only profile-bound open work', () => {
    const source = read('src/lib/coverage/actions.ts')
    const handoff = source.slice(source.indexOf('async function handoffProfileTasks'))
    const body = handoff.slice(0, handoff.indexOf('async function notifyCoverageActivated'))
    expect(body).toMatch(/\.eq\('profile_id', input\.profileId\)/)
    expect(body).toMatch(/\.in\('status', \['OPEN', 'IN_PROGRESS', 'WAITING'\]\)/)
  })
})

describe('TASK_PERSONAL_WORK_NOT_AUTO_HANDED_OFF', () => {
  it('the handoff query can never match a null profile', () => {
    const source = read('src/lib/coverage/actions.ts')
    const handoff = source.slice(source.indexOf('async function handoffProfileTasks'))
    const body = handoff.slice(0, handoff.indexOf('async function notifyCoverageActivated'))
    expect(body).not.toMatch(/\.is\('profile_id', null\)/)
    expect(body).not.toMatch(/profile_id: null/)
  })
})

describe('TASK_RETURN_TO_PRIMARY_MANUAL', () => {
  it('restore moves tasks only when the admin explicitly asks', () => {
    const source = read('src/lib/coverage/actions.ts')
    expect(source).toMatch(/input\.returnOpenTasks/)
    expect(source).toMatch(/input\.auth/)
    expect(read('src/components/coverage/admin-coverage-panel.tsx')).toMatch(/Restore primary/)
  })

  it('the restore API forwards the decision', () => {
    expect(read('src/app/api/team/coverage/approve/route.ts')).toMatch(/returnOpenTasks/)
  })
})

describe('TASK_COMPLETED_WORK_NOT_REASSIGNED_ON_RETURN', () => {
  it('the return query excludes completed and cancelled work', () => {
    const source = read('src/lib/coverage/actions.ts')
    const returnFn = source.slice(source.indexOf('async function returnProfileTasksToPrimary'))
    const body = returnFn.slice(0, returnFn.indexOf('\n}'))
    expect(body).toMatch(/\.in\('status', \['OPEN', 'IN_PROGRESS', 'WAITING'\]\)/)
    expect(body).not.toMatch(/DONE/)
  })
})

describe('REP_TASK_VISIBILITY', () => {
  it('a rep sees their own work plus the co-operators on their profiles', () => {
    const source = read('src/lib/tasks/assigned-tasks.ts')
    expect(source).toMatch(/return \{ mode: 'own', assigneeIds: \[\.\.\.ids\] \}/)
    expect(source).toMatch(/listExecutableIdentitiesForRep/)
    expect(source).toMatch(/query = query\.in\('assignee_rep_id', scope\.assigneeIds\)/)
  })

  it('task detail is invisible outside the assignee scope', () => {
    const source = read('src/lib/tasks/assigned-tasks.ts')
    expect(source).toMatch(/if \(!visible\) return null/)
  })
})

describe('MANAGER_TASK_TEAM_SCOPE', () => {
  it('a manager sees their managed team plus themselves', () => {
    const source = read('src/lib/tasks/assigned-tasks.ts')
    expect(source).toMatch(/auth\.managedTeamIds/)
    expect(source).toMatch(/ids\.add\(auth\.repId\)/)
  })

  it('a manager cannot move work inside or outside their scope', () => {
    const source = read('src/lib/tasks/assigned-tasks.ts')
    expect(source).toMatch(/Reassignment outside your team scope/)
    expect(source).toMatch(/Transfer outside your team scope/)
  })
})

describe('ADMIN_TASK_ORG_SCOPE', () => {
  it('an admin is org-wide', () => {
    const source = read('src/lib/tasks/assigned-tasks.ts')
    expect(source).toMatch(/if \(auth\.isOwner \|\| auth\.isAdmin\) \{\s*return \{ mode: 'org', assigneeIds: null \}/)
  })
})

describe('TASK_CROSS_ORG_DENIED', () => {
  it('every task read and write is pinned to the actor organization', () => {
    const source = read('src/lib/tasks/assigned-tasks.ts')
    const scoped = source.match(/organization_id', auth\.orgId|organization_id: auth\.orgId/g) ?? []
    expect(scoped.length).toBeGreaterThan(5)
    expect(source).toMatch(/assignee\.organization_id !== auth\.orgId/)
  })
})

describe('ADMIN_PROFILE_DIRECTORY_ORG_WIDE', () => {
  it('Team Profiles loads every org profile for an admin', () => {
    const source = read('src/lib/team/profiles.ts')
    expect(source).toMatch(/eq\('organization_id', orgId\)/)
    expect(source).not.toMatch(/assignee_rep_id/)
    const page = read('src/app/(app)/team/profiles/page.tsx')
    expect(page).toMatch(/ctx\.isAdmin \|\| ctx\.isOwner\s*\?\s*directory\.rows/)
  })
})

describe('REP_PROFILE_DIRECTORY_EXECUTABLE_ONLY', () => {
  it('the rep directory is primary + active coverage, never backups', async () => {
    const { getExecutableProfilesForRep } = await import('@/lib/profiles/canonical')
    const profiles: CanonicalProfileAssignment[] = [
      {
        profileId: 'p-1',
        profileName: 'Hassan',
        channels: ['linkedin'],
        identityIds: ['i-1'],
        assignedReps: [],
        primaryRepId: 'rep-1',
        primaryRepName: 'Rep One',
        primarySource: 'coverage',
        primaryReason: 'Explicit primary coverage',
        backups: [],
        operators: [],
        coverageState: 'EXPLICIT',
        needsReview: false,
        reviewReasons: [],
      },
      {
        profileId: 'p-2',
        profileName: 'Mehak',
        channels: ['upwork'],
        identityIds: ['i-2'],
        assignedReps: [],
        primaryRepId: 'rep-2',
        primaryRepName: 'Rep Two',
        primarySource: 'coverage',
        primaryReason: 'Explicit primary coverage',
        backups: [],
        operators: [],
        coverageState: 'EXPLICIT',
        needsReview: false,
        reviewReasons: [],
      },
    ]
    const set = { businessDate: '2026-11-08', profiles, ambiguous: [], unassigned: [] }
    // rep-1 is primary on p-1 and actively covering p-2; the p-2 backup chain
    // must not appear on its own.
    const executable = getExecutableProfilesForRep(set, 'rep-1', new Set(['p-2']))
    expect(executable.map((p) => p.profileId).sort()).toEqual(['p-1', 'p-2'])
    const withoutCoverage = getExecutableProfilesForRep(set, 'rep-1', new Set())
    expect(withoutCoverage.map((p) => p.profileId)).toEqual(['p-1'])
  })
})

describe('TEMP_COVERAGE_DOES_NOT_CHANGE_PRIMARY', () => {
  it('coverage activation and restore never write ownership', () => {
    const source = read('src/lib/coverage/actions.ts')
    expect(source).not.toMatch(/identity_assignments\s*\)?\s*\.(insert|upsert|update|delete)/)
    const restore = source.slice(source.indexOf('export async function restorePrimaryCoverage'))
    const body = restore.slice(0, restore.indexOf('async function returnProfileTasksToPrimary'))
    expect(body).not.toMatch(/profile_coverage/)
  })
})

describe('WAITING is open work, not a closed state', () => {
  it('a waiting task is open and waits in its own tab', () => {
    const waiting = toUnifiedTaskFromAssigned(assigned({ status: 'WAITING', waiting_on: 'CLIENT' }))
    expect(isOpenTask(waiting)).toBe(true)
    expect(classifyUnifiedTaskTab(waiting, Date.now(), 'UTC')).toBe('waiting')
  })

  it('a waiting task is not reported overdue', () => {
    const waiting = toUnifiedTaskFromAssigned(
      assigned({ status: 'WAITING', due_at: new Date(Date.now() - 3_600_000).toISOString() }),
    )
    expect(classifyUnifiedTaskTab(waiting, Date.now(), 'UTC')).toBe('waiting')
  })
})
