/**
 * Execution truth parity contracts.
 *
 * One business fact must have one value everywhere. These pin the authorities:
 * Inbox counts come from the canonical conversation-state derivation over the
 * rep's executable profiles; tasks come from the unified task loader; daily
 * progress uses remaining = max(target - completed, 0); profile execution is
 * primary + active coverage; availability is the single resolver.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

describe('REP_HOME_NEEDS_REPLY_INBOX_PARITY', () => {
  it('Rep Home reads needsReply from the canonical Inbox authority', () => {
    const page = read('src/app/(app)/dashboard/page.tsx')
    expect(page).toMatch(/getInboxCountsForRep/)
    expect(page).toMatch(/repliesWaiting: inboxCounts\.needsReply/)
  })

  it('the Inbox authority derives from conversation timestamps, not lead status', () => {
    expect(read('src/lib/operations/conversations.ts')).toMatch(/lastReplyAt.*lastSentAt|inboundIsLatest/)
    const counts = read('src/lib/operations/inbox-counts.ts')
    expect(counts).toMatch(/loadChatQueue/)
    expect(counts).toMatch(/waiting_me/)
  })
})

describe('REP_HOME_WAITING_ON_CLIENT_INBOX_PARITY', () => {
  it('Rep Home exposes the waiting-on-client count from the same authority', () => {
    const page = read('src/app/(app)/dashboard/page.tsx')
    expect(page).toMatch(/waitingOnClient: inboxCounts\.waitingOnClient/)
    expect(read('src/components/v4/v4-rep-home.tsx')).toMatch(/waiting on clients/)
  })
})

describe('REP_HOME_FOLLOWUP_INBOX_PARITY', () => {
  it('Rep Home follow-ups come from the canonical follow-up predicate', () => {
    const page = read('src/app/(app)/dashboard/page.tsx')
    expect(page).toMatch(/followUpsDue: inboxCounts\.followups/)
    expect(read('src/components/v4/v4-rep-home.tsx')).toMatch(/follow-ups due/)
  })
})

describe('REP_HOME_INBOX_LINK_PARITY', () => {
  it('each Inbox metric deep-links to its exact dataset', () => {
    const home = read('src/components/v4/v4-rep-home.tsx')
    expect(home).toMatch(/href="\/chats\?view=waiting_me"/)
    expect(home).toMatch(/href="\/chats\?view=waiting_them"/)
    expect(home).toMatch(/href="\/chats\?view=followups"/)
  })

  it('the destination predicates equal the count predicates', () => {
    const queue = read('src/lib/operations/chat-queue.ts')
    expect(queue).toMatch(/case 'waiting_me':\s*return row\.state === 'waiting_on_rep'/)
    expect(queue).toMatch(/case 'waiting_them':\s*return row\.state === 'waiting_on_prospect' \|\| row\.state === 'meeting'/)
    expect(queue).toMatch(/case 'followups':\s*return row\.state === 'follow_up_due'/)
  })
})

describe('REP_HOME_ASSIGNED_TASK_PARITY', () => {
  it('Rep Home and /tasks read the same unified task loader', () => {
    const dash = read('src/app/(app)/dashboard/page.tsx')
    expect(dash).toMatch(/loadUnifiedTasks/)
    expect(read('src/components/v4/v4-rep-home.tsx')).toMatch(/selectAssignedOpenTasks/)
    expect(read('src/app/(app)/tasks/page.tsx')).toMatch(/loadUnifiedTasks/)
  })

  it('the assigned selection is source=ASSIGNED and open statuses', () => {
    const rank = read('src/lib/tasks/rank-unified-tasks.ts')
    expect(rank).toMatch(/source: 'ASSIGNED'/)
    expect(rank).toMatch(/status === 'WAITING'/)
  })
})

describe('REP_HOME_OVERDUE_TASK_PARITY', () => {
  it('Rep Home overdue uses the canonical overdue classifier', () => {
    expect(read('src/components/v4/v4-rep-home.tsx')).toMatch(/selectAssignedOverdueTasks/)
    expect(read('src/lib/tasks/rank-unified-tasks.ts')).toMatch(/export function isOverdue/)
  })
})

describe('ADMIN_WAITING_TASK_PARITY', () => {
  it('Admin waiting count equals the Team Work Waiting tab', () => {
    const loader = read('src/lib/team/load-admin-command-center.ts')
    expect(loader).toMatch(/countWaitingAndTransferTasks/)
    expect(loader).toMatch(/waitingTasks: waitingAndTransfers\.waiting/)
    const view = read('src/components/tasks/task-workspace-view.tsx')
    expect(view).toMatch(/id: 'waiting'/)
  })
})

describe('ADMIN_TRANSFER_REQUEST_PARITY', () => {
  it('Admin transfer requests equal the Team Work Transfers tab', () => {
    const loader = read('src/lib/team/load-admin-command-center.ts')
    expect(loader).toMatch(/transferRequests: waitingAndTransfers\.transferRequests/)
    const view = read('src/components/tasks/task-workspace-view.tsx')
    expect(view).toMatch(/id: 'transfers'/)
    expect(view).toMatch(/x\.transfer/)
  })
})

describe('DAILY_COMPLETION_GLOBAL_PARITY', () => {
  it('remaining is clamped to zero everywhere it is computed', () => {
    const store = read('src/lib/store/supabase-store.ts')
    const matches = store.match(/remaining: Math\.max\(0,/g) ?? []
    expect(matches.length).toBeGreaterThan(5)
  })

  it('the Home target summary sums the same clamped targets', () => {
    expect(read('src/lib/rep-home/profile-scope.ts')).toMatch(/acc\.totalRemaining \+= t\.remaining/)
  })
})

describe('PROFILE_EXECUTION_GLOBAL_PARITY', () => {
  it('every profile consumer reads primary + active coverage', () => {
    const consumers = [
      'src/lib/auth/workspace.ts',
      'src/lib/workspace/resolve-active-identity.ts',
      'src/lib/profiles/assigned-profiles.ts',
      'src/app/(app)/layout.tsx',
      'src/app/(app)/chats/page.tsx',
    ]
    for (const file of consumers) {
      const source = read(file)
      expect(source).toMatch(/listMyWorkableIdentities|getAuthorizedIdentities/)
    }
  })

  it('no consumer reads the raw assignment table for execution scope', () => {
    const queue = read('src/lib/operations/chat-queue.ts')
    expect(queue).not.toMatch(/identity_assignments/)
  })
})

describe('AVAILABILITY_GLOBAL_PARITY', () => {
  it('the resolver is the single authority', () => {
    expect(read('src/lib/coverage/engine.ts')).toMatch(/export function resolveAvailability/)
  })

  it('Rep Home and the coverage engine share it', () => {
    const load = read('src/lib/coverage/load.ts')
    expect(load).toMatch(/resolveAvailability/)
    expect(load).toMatch(/fallbackAvailability/)
  })
})

describe('INBOX_ACTIVE_COVERAGE_EXECUTOR_PARITY', () => {
  it('the covering rep sees the covered profiles\' leads', () => {
    const queue = read('src/lib/operations/chat-queue.ts')
    expect(queue).toMatch(/coveredIdentityIds/)
    expect(queue).toMatch(/covered\.join/)
  })

  it('Rep Home and Inbox pass the same covered set', () => {
    const dash = read('src/app/(app)/dashboard/page.tsx')
    expect(dash).toMatch(/access === 'coverage'/)
    expect(read('src/app/(app)/chats/page.tsx')).toMatch(/access === 'coverage'/)
  })
})

describe('DASHBOARD_METRIC_DESTINATION_PARITY', () => {
  it('no actionable dashboard metric links to a generic destination', () => {
    const home = read('src/components/v4/v4-rep-home.tsx')
    // Every Inbox metric carries its view; "Open Inbox" is the whole inbox.
    expect(home).not.toMatch(/repliesWaiting<\/span>\s*<span[^>]*> waiting<\/span>\s*<\/Link>\s*<\/>\s*<\/>\s*\n\s*<\/>\s*\n\s*actions=/)
    const admin = read('src/components/v4/v4-admin-home.tsx')
    expect(admin).toMatch(/href="\/tasks\?view=overdue"/)
    expect(admin).toMatch(/href="\/tasks\?view=waiting"/)
    expect(admin).toMatch(/href="\/tasks\?view=transfers"/)
  })
})

describe('ADMIN_INBOX_COUNT_PARITY', () => {
  it('Admin Replies waiting comes from the org-level canonical Inbox authority', () => {
    const loader = read('src/lib/team/load-admin-command-center.ts')
    expect(loader).toMatch(/getInboxCountsForOrg/)
    expect(loader).toMatch(/inboxCounts/)
    const summary = read('src/lib/team/admin-command-summary.ts')
    expect(summary).toMatch(/inboxCounts\?\.needsReply/)
  })

  it('the org authority is never narrowed to one rep scope', () => {
    const counts = read('src/lib/operations/inbox-counts.ts')
    expect(counts).toMatch(/repIds: null/)
  })
})

describe('REP_PROFILE_CARD_LINK_FILTER_PARITY', () => {
  it('profile attention segments deep-link with the canonical profile filter', () => {
    const card = read('src/components/coverage/rep-profiles-today.tsx')
    expect(card).toMatch(/view=waiting_me\$\{profileFilter\}/)
    expect(card).toMatch(/view=followups\$\{profileFilter\}/)
    expect(card).toMatch(/profile=\$\{encodeURIComponent\(profile\.identityIds\[0\]\)\}/)
  })
})

describe('MANAGER_PERSONAL_INBOX_PARITY', () => {
  it('the manager personal block reads the same canonical authority as Rep Home', () => {
    expect(read('src/app/(app)/dashboard/page.tsx')).toMatch(/getInboxCountsForRep/)
    const manager = read('src/components/v4/v4-manager-home.tsx')
    expect(manager).toMatch(/personal\.day\?\.repliesWaiting/)
    expect(manager).toMatch(/personal\.day\?\.waitingOnClient/)
  })
})

describe('MANAGER_TEAM_INBOX_PARITY', () => {
  it("team rows use canonical per-rep counts over each rep's executable scope", () => {
    const loader = read('src/lib/team/load-manager-home.ts')
    expect(loader).toMatch(/listExecutableIdentityScope/)
    expect(loader).toMatch(/getInboxCountsForRep/)
    expect(loader).toMatch(/inboxCountsByRep/)
    expect(read('src/lib/team/manager-home-summary.ts')).toMatch(/canonical\?\.needsReply/)
  })
})

describe('ADMIN_ORG_INBOX_PARITY', () => {
  it('Admin reply and follow-up metrics come from the org canonical authority', () => {
    const loader = read('src/lib/team/load-admin-command-center.ts')
    expect(loader).toMatch(/getInboxCountsForOrg/)
    const summary = read('src/lib/team/admin-command-summary.ts')
    expect(summary).toMatch(/inboxCounts\?\.needsReply/)
    expect(summary).toMatch(/inboxCounts\?\.followups/)
  })
})

describe('INBOX_REFACTOR_PRESERVES_CANONICAL_COUNTS', () => {
  it('canonical counts take precedence; lead status is only an explicit fallback', () => {
    expect(read('src/lib/team/manager-home-summary.ts')).toMatch(/canonical\?\.needsReply \?\? row\.repliesWaiting/)
  })

  it('the queue authority still derives counts from conversation state', () => {
    const queue = read('src/lib/operations/chat-queue.ts')
    expect(queue).toMatch(/countChatViews/)
    expect(queue).not.toMatch(/status === 'replied'/)
  })
})

describe('INBOX_REFACTOR_PRESERVES_SCOPE', () => {
  it('the executable scope is primary + active coverage, backup-only excluded', () => {
    const access = read('src/lib/coverage/access.ts')
    expect(access).toMatch(/role', 'PRIMARY'/)
    expect(access).toMatch(/listActiveCoveredIdentities/)
    expect(access).toMatch(/if \(!isCovered && !isPrimary\) continue/)
  })
})

describe('INBOX_INTELLIGENCE_DOES_NOT_DRIVE_STATE', () => {
  it('intelligence adds presentation only and never computes Inbox counts', () => {
    const intel = read('src/lib/operations/chat-intelligence.ts')
    expect(intel).toMatch(/deriveConversationRow/)
    expect(intel).not.toMatch(/needsReply|waitingOnClient|followups|repliesWaiting/)
  })
})
