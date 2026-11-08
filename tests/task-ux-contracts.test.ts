/**
 * Task UX contracts — communication, unread state, waiting/resume, transfer
 * approval, creation-surface parity, and the coverage handoff/return preview.
 *
 * These pin the behaviours the daily surfaces depend on: a list row never loads
 * a thread, an unread comment is the canonical notification read flag, and a
 * transfer request never moves work by itself.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

describe('TASK_LATEST_COMMENT_PREVIEW', () => {
  it('the list loader fetches one bounded latest-comment projection', () => {
    const source = read('src/lib/tasks/load-unified-tasks.ts')
    expect(source).toMatch(/listLatestTaskComments\(client, auth, assignedIds\)/)
    expect(source).not.toMatch(/for \(const row of rows\)[\s\S]{0,200}internal_notes/)
  })

  it('the projection is capped', () => {
    const source = read('src/lib/tasks/assigned-tasks.ts')
    const fn = source.slice(source.indexOf('export async function listLatestTaskComments'))
    expect(fn.slice(0, fn.indexOf('\n}'))).toMatch(/\.limit\(500\)/)
  })

  it('rows render a preview or an explicit empty state', () => {
    const view = read('src/components/tasks/task-workspace-view.tsx')
    expect(view).toMatch(/No discussion yet/)
    expect(view).toMatch(/LatestComment/)
  })
})

describe('TASK_UNREAD_COMMENT_STATE', () => {
  it('unread is the canonical notification read flag', () => {
    const source = read('src/lib/tasks/assigned-tasks.ts')
    const fn = source.slice(source.indexOf('export async function listUnreadTaskCommentCounts'))
    const body = fn.slice(0, fn.indexOf('\n}'))
    expect(body).toMatch(/notification_type', 'task_comment'/)
    expect(body).toMatch(/eq\('read', false\)/)
  })

  it('a new task comment notifies the other participants', () => {
    const source = read('src/lib/operations/notes.ts')
    expect(source).toMatch(/notifyTaskCommentParticipants/)
    expect(source).toMatch(/type: 'task_comment'/)
  })

  it('the notification center categorises it as a task notification', () => {
    expect(read('src/lib/notifications/model.ts')).toMatch(/t === 'task_comment'/)
  })
})

describe('TASK_COMMENT_MARK_READ', () => {
  it('opening a conversation clears only its own unread comments', () => {
    const source = read('src/lib/tasks/assigned-tasks.ts')
    const fn = source.slice(source.indexOf('export async function markTaskCommentsRead'))
    const body = fn.slice(0, fn.indexOf('\n}'))
    expect(body).toMatch(/update\(\{ read: true \}\)/)
    expect(body).toMatch(/like\('link', `%task=assigned:\$\{taskId\}%`\)/)
  })

  it('the drawer marks read when a task opens', () => {
    expect(read('src/components/tasks/task-detail-drawer.tsx')).toMatch(/read-task/)
  })

  it('the route is admin-free — any participant may mark their own read', () => {
    expect(read('src/app/api/notifications/read-task/route.ts')).toMatch(/getAuthContext/)
  })
})

describe('TASK_WAITING_REASON', () => {
  it('a waiting note is persisted with the waiting state', () => {
    const source = read('src/lib/tasks/assigned-tasks.ts')
    const fn = source.slice(source.indexOf('export async function setAssignedTaskWaiting'))
    const body = fn.slice(0, fn.indexOf('\n}'))
    expect(body).toMatch(/waiting_note:/)
  })

  it('the API accepts the note and the drawer exposes it', () => {
    expect(read('src/app/api/tasks/[id]/route.ts')).toMatch(/note\??:/)
    expect(read('src/components/tasks/task-detail-drawer.tsx')).toMatch(/Waiting note/)
  })

  it('the column exists in the schema', () => {
    expect(read('supabase/migrations/20261108130000_task_ux.sql')).toMatch(/waiting_note/)
  })
})

describe('TASK_WAITING_MANUAL_RESUME', () => {
  it('resume moves WAITING to IN_PROGRESS and records an event', () => {
    const source = read('src/lib/tasks/assigned-tasks.ts')
    const fn = source.slice(source.indexOf('export async function resumeAssignedTask'))
    const body = fn.slice(0, fn.indexOf('\n}'))
    expect(body).toMatch(/status: 'IN_PROGRESS'/)
    expect(body).toMatch(/TASK_STARTED/)
  })

  it('a comment alone never resumes the task', () => {
    const notes = read('src/lib/operations/notes.ts')
    expect(notes).not.toMatch(/resume/)
    const drawer = read('src/components/tasks/task-detail-drawer.tsx')
    // The only resume trigger is the explicit button.
    expect(drawer).toMatch(/action: 'resume'/)
  })
})

describe('TASK_TRANSFER_REQUEST_VISIBLE', () => {
  it('requesting a transfer never changes the assignee', () => {
    const source = read('src/lib/tasks/assigned-tasks.ts')
    const fn = source.slice(source.indexOf('export async function requestAssignedTaskTransfer'))
    const body = fn.slice(0, fn.indexOf('\n}'))
    expect(body).not.toMatch(/assignee_rep_id:/)
    expect(body).toMatch(/transfer_requested_to: toRepId/)
  })

  it('the task shows it is waiting for approval', () => {
    expect(read('src/components/tasks/task-detail-drawer.tsx')).toMatch(/Waiting for manager approval/)
  })
})

describe('TASK_TRANSFER_APPROVAL', () => {
  it('approval reuses the canonical reassignment path', () => {
    const source = read('src/lib/tasks/assigned-tasks.ts')
    const fn = source.slice(source.indexOf('export async function approveAssignedTaskTransfer'))
    const body = fn.slice(0, fn.indexOf('\n}'))
    expect(body).toMatch(/reassignAssignedTask/)
  })
})

describe('TASK_TRANSFER_DECLINE_PRESERVES_ASSIGNEE', () => {
  it('declining clears the request without touching the assignee', () => {
    const source = read('src/lib/tasks/assigned-tasks.ts')
    const fn = source.slice(source.indexOf('export async function declineAssignedTaskTransfer'))
    const body = fn.slice(0, fn.indexOf('\n}'))
    expect(body).not.toMatch(/assignee_rep_id:/)
    expect(body).toMatch(/TASK_TRANSFER_DECLINED/)
  })

  it('the decline event type is in the schema', () => {
    expect(read('supabase/migrations/20261108130000_task_ux.sql')).toMatch(/TASK_TRANSFER_DECLINED/)
  })
})

describe('INBOX_TASK_CONTEXT_PARITY', () => {
  it('the inbox opens the same composer with lead + profile prefilled', () => {
    const source = read('src/components/chats/chat-intelligence-panel.tsx')
    expect(source).toMatch(/AssignTaskButton/)
    expect(source).toMatch(/defaultLeadId=\{intel\.leadId\}/)
    expect(source).toMatch(/defaultProfileId=\{intel\.profileId/)
  })
})

describe('LEAD_TASK_CONTEXT_PARITY', () => {
  it('Lead 360 opens the same composer with the lead prefilled', () => {
    expect(read('src/components/lead-workspace-async.tsx')).toMatch(/defaultLeadId=\{lead\.id\}/)
  })
})

describe('PROFILE_TASK_CONTEXT_PARITY', () => {
  it('Profile detail opens the same composer with the profile prefilled', () => {
    expect(read('src/components/team/team-profile-detail.tsx')).toMatch(/defaultProfileId=\{model\.personId\}/)
  })
})

describe('COVERAGE_HANDOFF_TASK_PREVIEW', () => {
  it('the approval item carries the moving/not-moving counts', () => {
    const engine = read('src/lib/coverage/engine.ts')
    expect(engine).toMatch(/personalTaskCount/)
    const panel = read('src/components/coverage/admin-coverage-panel.tsx')
    expect(panel).toMatch(/Also moving: /)
    expect(panel).toMatch(/personal task/)
  })
})

describe('RETURN_TO_PRIMARY_TASK_DECISION', () => {
  it('restore accepts a specific task subset', () => {
    const source = read('src/lib/coverage/actions.ts')
    const fn = source.slice(source.indexOf('async function returnProfileTasksToPrimary'))
    const body = fn.slice(0, fn.indexOf('\n}'))
    expect(body).toMatch(/onlyTaskIds/)
    expect(body).toMatch(/\.in\('id', onlyTaskIds/)
  })

  it('completed and cancelled work is never in the return set', () => {
    const source = read('src/lib/coverage/actions.ts')
    const fn = source.slice(source.indexOf('async function returnProfileTasksToPrimary'))
    const body = fn.slice(0, fn.indexOf('\n}'))
    expect(body).toMatch(/\.in\('status', \['OPEN', 'IN_PROGRESS', 'WAITING'\]\)/)
    expect(body).not.toMatch(/DONE/)
  })

  it('the dialog offers per-task choice and a return-all action', () => {
    const panel = read('src/components/coverage/admin-coverage-panel.tsx')
    expect(panel).toMatch(/Return all open profile tasks/)
    expect(panel).toMatch(/type="checkbox"/)
  })
})

describe('TASK_LIST_BOUNDED_THREAD_READ', () => {
  it('the list path never reads a whole thread per row', () => {
    const source = read('src/lib/tasks/load-unified-tasks.ts')
    // One call, with the full id list — not one call per task.
    expect(source.match(/listLatestTaskComments\(/g)).toHaveLength(1)
  })
})

describe('ADMIN_TEAM_WORK_ORG_SCOPE', () => {
  it('an admin work query is org-wide', () => {
    const source = read('src/lib/tasks/assigned-tasks.ts')
    expect(source).toMatch(/return \{ mode: 'org', assigneeIds: null \}/)
  })
})

describe('REP_TASK_SCOPE', () => {
  it('a rep work query is pinned to their own assignee id', () => {
    expect(read('src/lib/tasks/assigned-tasks.ts')).toMatch(/mode: 'own', assigneeIds: \[auth\.repId\]/)
  })
})

describe('TASK_CROSS_ORG_DENIED', () => {
  it('task reads and writes carry the organization boundary', () => {
    const source = read('src/lib/tasks/assigned-tasks.ts')
    const scoped = source.match(/organization_id', auth\.orgId|organization_id: auth\.orgId/g) ?? []
    expect(scoped.length).toBeGreaterThan(5)
  })
})
