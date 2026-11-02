/**
 * Phase 8 final activation — notification emitters at canonical write paths.
 * Synthetic data only. A stateful fake `notifications` table stands in for the
 * database so replay / dedupe behaviour is exercised end to end through the
 * one writer (deliver.ts).
 */
import { describe, expect, it, vi } from 'vitest'
import { notificationFor, notificationsFor, categoryForType, type OperationalEvent } from '@/lib/notifications/model'
import { deliver, notifyForEvent } from '@/lib/notifications/deliver'
import { emitOverdueTaskNotifications } from '@/lib/scheduler/run'
import { notifyRequestIntent } from '@/lib/conversation/service'
import type { ConversationMemory } from '@/lib/conversation/types'

type Row = Record<string, unknown>

/** Minimal PostgREST-shaped fake: notifications (stateful) + canned tables. */
function fakeDb(opts: { unique?: boolean; tables?: Record<string, Row[]>; recipientOnlyReads?: string | null } = {}) {
  const notifications: Row[] = []
  const tables = opts.tables ?? {}
  const make = (table: string) => {
    const filters: Array<[string, string, unknown]> = []
    let insertRow: Row | null = null
    const b: Record<string, unknown> = {}
    const chain = (name: string) => (...args: unknown[]) => {
      if (name === 'eq' || name === 'in' || name === 'lt' || name === 'not') filters.push([name, args[0] as string, args[1]])
      if (name === 'insert') insertRow = args[0] as Row
      return b
    }
    for (const m of ['select', 'eq', 'in', 'not', 'lt', 'gte', 'order', 'limit', 'range', 'insert', 'update', 'neq']) b[m] = chain(m)
    const run = () => {
      if (table === 'notifications') {
        if (insertRow) {
          const dup = notifications.some(
            (n) => n.organization_id === insertRow!.organization_id && n.recipient_id === insertRow!.recipient_id && n.dedupe_key === insertRow!.dedupe_key,
          )
          if (dup && opts.unique) return { data: null, error: { code: '23505', message: 'duplicate key' } }
          notifications.push(insertRow)
          return { data: null, error: null }
        }
        let rows = notifications.filter((n) => filters.every(([op, col, v]) => op !== 'eq' || n[col] === v))
        // RLS: a non-recipient caller cannot see someone else's row.
        if (opts.recipientOnlyReads) rows = rows.filter((n) => n.recipient_id === opts.recipientOnlyReads)
        return { data: rows[0] ?? null, error: null }
      }
      const rows = (tables[table] ?? []).filter((r) =>
        filters.every(([op, col, v]) => (op === 'eq' ? r[col] === v : op === 'in' ? (v as unknown[]).includes(r[col]) : true)),
      )
      return { data: rows, error: null }
    }
    b.maybeSingle = () => Promise.resolve(run())
    b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej)
    return b
  }
  return { client: { from: make } as never, notifications }
}

const ORG = 'org-a'

describe('NOTIFICATION_INBOUND_REPLY', () => {
  const base: Extract<OperationalEvent, { kind: 'INBOUND_REPLY' }> = {
    kind: 'INBOUND_REPLY', leadId: 'l1', messageId: 'm1', ownerRepId: 'rep-a', actorRepId: null, person: 'Sarah Chen', company: 'Acme', text: 'Yes, Thursday works.',
  }

  it('a reply the owner did not log (email webhook) notifies the owner once, deep-linked to the thread', async () => {
    const { client, notifications } = fakeDb()
    expect(await notifyForEvent(client, ORG, base)).toBe('delivered')
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      recipient_id: 'rep-a', notification_type: 'reply_received', link: '/chats?lead=l1', dedupe_key: 'reply_received:l1:m1',
    })
    expect(categoryForType('reply_received')).toBe('replies')
  })

  it('auto-replies and empty rows are system noise and never notify', () => {
    expect(notificationFor({ ...base, text: 'I am currently out of the office until Monday.' })).toBeNull()
    expect(notificationFor({ ...base, text: '   ' })).toBeNull()
    expect(notificationFor({ ...base, text: null })).toBeNull()
  })

  it('an unowned lead has no responsible user, so nothing is sent', () => {
    expect(notificationFor({ ...base, ownerRepId: null })).toBeNull()
  })
})

describe('NOTIFICATION_MEETING_REQUEST / NOTIFICATION_PROPOSAL_REQUEST', () => {
  const memory = (intent: string, turnId = 't2') =>
    ({ lastClientAnalysis: { turnId, intent, sentiment: 'positive', questions: [], buyingSignals: [], summary: '' } }) as unknown as ConversationMemory
  const store = (client: unknown, me: string) =>
    ({ getSupabaseClient: () => client, organizationId: ORG, getCurrentRepId: () => me }) as never
  const lead = { id: 'l1', ownerRepId: 'rep-a', contactName: 'Sarah Chen' } as never

  it('a newly analysed meeting_request turn notifies the owner when someone else opened the thread', async () => {
    const { client, notifications } = fakeDb()
    await notifyRequestIntent(store(client, 'mgr-1'), lead, 't1', memory('meeting_request'))
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({ recipient_id: 'rep-a', notification_type: 'meeting_requested', dedupe_key: 'meeting_requested:l1:t2' })
    expect(categoryForType('meeting_requested')).toBe('meetings')
  })

  it('pricing intent is the proposal request', async () => {
    const { client, notifications } = fakeDb()
    await notifyRequestIntent(store(client, 'mgr-1'), lead, null, memory('pricing'))
    expect(notifications[0]).toMatchObject({ notification_type: 'proposal_requested', dedupe_key: 'proposal_requested:l1:t2' })
  })

  it('only a NEW analysed turn emits — reloading the same turn is silent; other intents never emit', async () => {
    const { client, notifications } = fakeDb()
    await notifyRequestIntent(store(client, 'mgr-1'), lead, 't2', memory('meeting_request', 't2'))
    await notifyRequestIntent(store(client, 'mgr-1'), lead, 't1', memory('interested'))
    await notifyRequestIntent(store(client, 'mgr-1'), lead, 't1', memory('question'))
    expect(notifications).toHaveLength(0)
  })

  it('the owner analysing their own thread is not notified (self-skip)', async () => {
    const { client, notifications } = fakeDb()
    await notifyRequestIntent(store(client, 'rep-a'), lead, 't1', memory('meeting_request'))
    expect(notifications).toHaveLength(0)
  })

  it('demo store (no client) never throws', async () => {
    const demo = { getSupabaseClient: () => { throw new Error('no client') }, organizationId: ORG, getCurrentRepId: () => 'x' } as never
    await expect(notifyRequestIntent(demo, lead, 't1', memory('meeting_request'))).resolves.toBeUndefined()
  })
})

describe('NOTIFICATION_LEAD_REASSIGNED', () => {
  const event: Extract<OperationalEvent, { kind: 'LEAD_REASSIGNED' }> = {
    kind: 'LEAD_REASSIGNED', leadId: 'l1', newOwnerRepId: 'rep-b', previousOwnerRepId: 'rep-a', actorRepId: 'mgr-1', actorName: null, person: 'Sarah Chen',
  }

  it('new owner gets the actionable notice; previous owner an informational one', async () => {
    const { client, notifications } = fakeDb()
    expect(await notifyForEvent(client, ORG, event)).toBe('delivered')
    expect(notifications.map((n) => [n.recipient_id, n.notification_type])).toEqual([
      ['rep-b', 'lead_reassigned'],
      ['rep-a', 'lead_reassigned_away'],
    ])
    expect(categoryForType('lead_reassigned_away')).toBe('assignments')
  })

  it('the previous owner handing the lead over themselves gets nothing; replay is silent', async () => {
    const { client, notifications } = fakeDb()
    await notifyForEvent(client, ORG, { ...event, actorRepId: 'rep-a' })
    await notifyForEvent(client, ORG, { ...event, actorRepId: 'rep-a' })
    expect(notifications.map((n) => n.recipient_id)).toEqual(['rep-b'])
  })

  it('referLead (the only owner-change path) emits through the writer with the previous owner', async () => {
    vi.resetModules()
    const { client, notifications } = fakeDb({ tables: {} })
    const leadsUpdate = {
      update: () => leadsUpdate, eq: () => leadsUpdate, select: () => leadsUpdate,
      maybeSingle: () => Promise.resolve({ data: { contact_name: 'Sarah Chen' }, error: null }),
    }
    const service = { from: (t: string) => (t === 'leads' ? leadsUpdate : (client as { from: (t: string) => unknown }).from(t)) }
    vi.doMock('@/lib/supabase/service', () => ({ createServiceSupabase: () => service }))
    vi.doMock('@/lib/action-ledger', () => ({ emitAction: async () => 'ae-1' }))
    const { referLead } = await import('@/lib/lead-referral')
    const result = await referLead({ orgId: ORG, leadId: 'l1', fromRepId: 'mgr-1', toRepId: 'rep-b', previousOwnerRepId: 'rep-a' })
    expect(result.success).toBe(true)
    expect(notifications.map((n) => n.dedupe_key)).toEqual(['lead_reassigned:l1:rep-b', 'lead_reassigned_away:l1:rep-b'])
    vi.doUnmock('@/lib/supabase/service')
    vi.doUnmock('@/lib/action-ledger')
  })
})

describe('NOTIFICATION_TASK_OVERDUE', () => {
  const now = new Date('2026-11-01T12:00:00.000Z')
  const tasks = [
    { id: 't1', organization_id: ORG, assignee_rep_id: 'rep-a', title: 'Call Sarah', due_at: '2026-11-01T09:00:00.000Z', status: 'OPEN' },
    { id: 't2', organization_id: ORG, assignee_rep_id: null, title: 'Unassigned', due_at: '2026-11-01T08:00:00.000Z', status: 'OPEN' },
  ]

  it('one notice per task per due window; repeated scheduler runs never re-notify', async () => {
    const { client, notifications } = fakeDb({ tables: { assigned_tasks: tasks } })
    expect(await emitOverdueTaskNotifications(client, ORG, now)).toEqual({ overdue: 2, notified: 1 })
    expect(await emitOverdueTaskNotifications(client, ORG, now)).toEqual({ overdue: 2, notified: 0 })
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({ recipient_id: 'rep-a', dedupe_key: 'task_overdue:t1:2026-11-01T09:00:00.000Z' })
  })

  it('a reschedule opens a new due window', () => {
    const a = notificationFor({ kind: 'TASK_OVERDUE', taskId: 't1', assigneeRepId: 'rep-a', title: 'x', dueAt: '2026-11-01T09:00:00.000Z' })
    const b = notificationFor({ kind: 'TASK_OVERDUE', taskId: 't1', assigneeRepId: 'rep-a', title: 'x', dueAt: '2026-11-02T09:00:00.000Z' })
    expect(a!.dedupeKey).not.toBe(b!.dedupeKey)
  })

  it('task tables not migrated → skipped, no throw', async () => {
    const client = {
      from: () => {
        const b: Record<string, unknown> = {}
        for (const m of ['select', 'eq', 'in', 'not', 'lt', 'order', 'limit']) b[m] = () => b
        b.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { code: '42P01', message: 'relation "assigned_tasks" does not exist' } }).then(res)
        return b
      },
    } as never
    expect(await emitOverdueTaskNotifications(client, ORG, now)).toEqual({ overdue: 0, notified: 0 })
  })
})

describe('NOTIFICATION_REPLAY_DEDUPE', () => {
  const input = { organizationId: ORG, recipientId: 'rep-a', type: 'reply_received', title: 't', body: '', link: '/chats?lead=l1', dedupeKey: 'reply_received:l1:m1' }

  it('the recipient replaying an event: the pre-insert check finds the row', async () => {
    const { client, notifications } = fakeDb()
    expect(await deliver(client, input)).toBe('delivered')
    expect(await deliver(client, input)).toBe('duplicate')
    expect(notifications).toHaveLength(1)
  })

  it('a non-recipient replaying (RLS hides the row): the unique index answers duplicate', async () => {
    const { client, notifications } = fakeDb({ unique: true, recipientOnlyReads: 'someone-else' })
    expect(await deliver(client, input)).toBe('delivered')
    expect(await deliver(client, input)).toBe('duplicate')
    expect(notifications).toHaveLength(1)
  })

  it('production-shaped table (missing canonical columns) → unavailable, never a fake success', async () => {
    const client = {
      from: () => {
        const b: Record<string, unknown> = {}
        for (const m of ['select', 'eq', 'limit']) b[m] = () => b
        b.maybeSingle = () => Promise.resolve({ data: null, error: { code: '42703', message: 'column notifications.recipient_id does not exist' } })
        return b
      },
    } as never
    expect(await deliver(client, input)).toBe('unavailable')
  })
})

describe('NOTIFICATION_SELF_SKIP', () => {
  it('no event notifies the person who caused it', () => {
    const self = 'rep-a'
    const events: OperationalEvent[] = [
      { kind: 'INBOUND_REPLY', leadId: 'l', messageId: 'm', ownerRepId: self, actorRepId: self, person: 'p', company: null, text: 'hello' },
      { kind: 'TASK_ASSIGNED', taskId: 't', assigneeRepId: self, actorRepId: self, actorName: null, title: 'x' },
      { kind: 'TASK_REASSIGNED', taskId: 't', assigneeRepId: self, actorRepId: self, actorName: null, title: 'x' },
      { kind: 'UPDATE_REQUESTED', taskId: 't', assigneeRepId: self, actorRepId: self, actorName: null, title: 'x' },
      { kind: 'LEAD_REASSIGNED', leadId: 'l', newOwnerRepId: self, previousOwnerRepId: null, actorRepId: self, actorName: null, person: 'p' },
      { kind: 'MEETING_REQUESTED', leadId: 'l', messageId: 'm', ownerRepId: self, actorRepId: self, person: 'p' },
      { kind: 'PROPOSAL_REQUESTED', leadId: 'l', messageId: 'm', ownerRepId: self, actorRepId: self, person: 'p' },
    ]
    for (const e of events) expect(notificationsFor(e)).toEqual([])
  })

  it('UI events never notify', () => {
    for (const kind of ['LEAD_OPENED', 'FILTER_CHANGED', 'DRAFT_GENERATED', 'SCORE_RECALCULATED'] as const) {
      expect(notificationsFor({ kind })).toEqual([])
    }
  })
})

describe('NOTIFICATION_ROLE_SCOPE', () => {
  it('one event → at most one notification per recipient, only to the responsible people', () => {
    const events: OperationalEvent[] = [
      { kind: 'INBOUND_REPLY', leadId: 'l', messageId: 'm', ownerRepId: 'rep-a', actorRepId: null, person: 'p', company: null, text: 'hello' },
      { kind: 'TASK_ASSIGNED', taskId: 't', assigneeRepId: 'rep-a', actorRepId: 'mgr', actorName: null, title: 'x' },
      { kind: 'TASK_OVERDUE', taskId: 't', assigneeRepId: 'rep-a', title: 'x', dueAt: '2026-11-01T09:00:00Z' },
      { kind: 'LEAD_REASSIGNED', leadId: 'l', newOwnerRepId: 'rep-b', previousOwnerRepId: 'rep-a', actorRepId: 'mgr', actorName: null, person: 'p' },
      { kind: 'MEETING_REQUESTED', leadId: 'l', messageId: 'm', ownerRepId: 'rep-a', actorRepId: 'mgr', person: 'p' },
    ]
    for (const e of events) {
      const recipients = notificationsFor(e).map((n) => n.recipientId)
      expect(new Set(recipients).size).toBe(recipients.length)
      expect(recipients).not.toContain('mgr')
    }
  })

  it('the bell / page API reads only the signed-in recipient’s rows', async () => {
    const filters: Array<[string, unknown]> = []
    const builder: Record<string, unknown> = {}
    for (const m of ['select', 'order', 'limit']) builder[m] = () => builder
    builder.eq = (col: string, v: unknown) => {
      filters.push([col, v])
      return builder
    }
    builder.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(res)
    vi.resetModules()
    vi.doMock('@/lib/auth/current', () => ({ getCurrentUser: async () => ({ rep: { id: 'rep-a' }, organization: { id: ORG } }) }))
    vi.doMock('@/lib/supabase/server', () => ({ createServerSupabase: async () => ({ from: () => builder }) }))
    vi.doMock('@/lib/operations/capabilities', () => ({ getDatabaseCapabilities: async () => ({ notifications: true }) }))
    const { GET } = await import('@/app/api/notifications-app/route')
    const res = await GET(new Request('http://x/api/notifications-app?limit=8'))
    expect(res.status).toBe(200)
    expect(filters.filter(([c]) => c === 'recipient_id').every(([, v]) => v === 'rep-a')).toBe(true)
    expect(filters.some(([c]) => c === 'recipient_id')).toBe(true)
    vi.doUnmock('@/lib/auth/current')
    vi.doUnmock('@/lib/supabase/server')
    vi.doUnmock('@/lib/operations/capabilities')
  })
})
