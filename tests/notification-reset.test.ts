import { describe, expect, it } from 'vitest'
import { resetNotifications, type NotificationResetReport } from '@/lib/notifications/reset'

/**
 * In-memory DbClient covering exactly the query-builder subset the reset uses.
 * The point is the policy: mark everything read, delete only stale read system
 * rows, never touch actionable rows.
 */
function fakeClient(rows: Array<Record<string, unknown>>) {
  const state = [...rows]
  const client = {
    provider: 'postgres' as const,
    from(table: string) {
      const filters: Array<(row: Record<string, unknown>) => boolean> = []
      let mode: 'select' | 'update' | 'delete' = 'select'
      let updateValues: Record<string, unknown> = {}
      let deleted: Array<Record<string, unknown>> = []
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (col: string, value: unknown) => {
          filters.push((row) => row[col] === value)
          return builder
        },
        lt: (col: string, value: unknown) => {
          filters.push((row) => String(row[col]) < String(value))
          return builder
        },
        in: (col: string, values: readonly unknown[]) => {
          filters.push((row) => values.includes(row[col]))
          return builder
        },
        update: (values: Record<string, unknown>) => {
          mode = 'update'
          updateValues = values
          return builder
        },
        delete: () => {
          mode = 'delete'
          return builder
        },
        limit: () => builder,
        then: (resolve: (value: { data: unknown; error: unknown }) => void) => {
          const matching = state.filter((row) => filters.every((fn) => fn(row)))
          if (mode === 'update') {
            for (const row of matching) Object.assign(row, updateValues)
            resolve({ data: matching, error: null })
            return
          }
          if (mode === 'delete') {
            deleted = matching
            for (const row of matching) state.splice(state.indexOf(row), 1)
            resolve({ data: deleted, error: null })
            return
          }
          resolve({ data: matching, error: null })
        },
      }
      void table
      return builder
    },
  }
  return { client, state }
}

const ORG = 'org-1'

function row(id: string, type: string, read: boolean, createdAt: string, recipientId = 'rep-1') {
  return {
    id,
    organization_id: ORG,
    notification_type: type,
    read,
    created_at: createdAt,
    recipient_id: recipientId,
  }
}

describe('resetNotifications', () => {
  it('marks the inbox read and drops only stale read system rows', async () => {
    const now = new Date('2026-11-13T12:00:00Z')
    const stale = new Date(now.getTime() - 10 * 86_400_000).toISOString()
    const recent = new Date(now.getTime() - 1 * 86_400_000).toISOString()

    const { client, state } = fakeClient([
      row('1', 'reply_received', false, recent),
      row('2', 'task_assigned', false, recent),
      row('3', 'day_missed', true, stale),
      row('4', 'target_updated', true, stale),
      row('5', 'day_missed', true, recent),
      row('6', 'responsibility_acknowledgement', true, stale),
    ])

    const report: NotificationResetReport = await resetNotifications(client as never, ORG, {
      now,
      staleAfterDays: 7,
    })

    expect(report.before.total).toBe(6)
    expect(report.before.unread).toBe(2)
    expect(report.markedRead).toBe(2)
    expect(report.deleted).toBe(2)
    expect(report.after.total).toBe(4)
    expect(report.after.unread).toBe(0)
    // Every remaining row is read.
    expect(state.every((entry) => entry.read === true)).toBe(true)
    // Actionable rows and recent system rows survive.
    expect(state.map((entry) => entry.id).sort()).toEqual(['1', '2', '5', '6'])
  })

  it('preserves dedupe keys by never deleting actionable notifications', async () => {
    const now = new Date('2026-11-13T12:00:00Z')
    const stale = new Date(now.getTime() - 30 * 86_400_000).toISOString()
    const { client, state } = fakeClient([
      row('1', 'reply_received', true, stale),
      row('2', 'task_overdue', true, stale),
      row('3', 'upwork_client_replied', true, stale),
    ])
    const report = await resetNotifications(client as never, ORG, { now })
    expect(report.deleted).toBe(0)
    expect(state).toHaveLength(3)
  })
})
