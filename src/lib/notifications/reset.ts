import type { DbClient } from '@/lib/db/types'

/**
 * Notification inbox reset.
 *
 * The `notifications` table is the operational INBOX, not an audit trail —
 * the audit authorities are `action_events` and `coverage_events`, which this
 * module never touches. A reset therefore:
 *
 *   1. snapshots the inbox (total / unread / by type / by user)
 *   2. marks everything read, so the active inbox is clean
 *   3. deletes only stale, already-read SYSTEM noise older than the cutoff,
 *      keeping actionable rows and their dedupe keys so a replayed event
 *      cannot notify twice
 *
 * It never deletes task history, messages, or any *_events table.
 */

const STALE_SYSTEM_TYPES = [
  'day_missed',
  'coverage_ended',
  'coverage_activated',
  'coverage_activated_primary',
  'target_updated',
] as const

const STALE_AFTER_DAYS = 7

export interface NotificationResetReport {
  before: {
    total: number
    unread: number
    byType: Record<string, number>
    byUser: Array<{ repId: string; total: number; unread: number }>
  }
  deleted: number
  markedRead: number
  after: { total: number; unread: number }
}

interface NotificationSnapshotRow {
  id: string
  notification_type: string
  read: boolean
  recipient_id: string | null
}

export async function resetNotifications(
  client: DbClient,
  orgId: string,
  options: { staleAfterDays?: number; now?: Date } = {},
): Promise<NotificationResetReport> {
  const staleAfterDays = options.staleAfterDays ?? STALE_AFTER_DAYS
  const now = options.now ?? new Date()
  const cutoff = new Date(now.getTime() - staleAfterDays * 86_400_000).toISOString()

  const { data, error } = await client
    .from('notifications')
    .select('id, notification_type, read, recipient_id')
    .eq('organization_id', orgId)
    .limit(20_000)
  if (error) throw error

  const rows = (data ?? []) as NotificationSnapshotRow[]
  const byType: Record<string, number> = {}
  const byUser = new Map<string, { total: number; unread: number }>()
  let unread = 0
  for (const row of rows) {
    byType[row.notification_type] = (byType[row.notification_type] ?? 0) + 1
    const entry = byUser.get(row.recipient_id ?? '') ?? { total: 0, unread: 0 }
    entry.total += 1
    if (!row.read) entry.unread += 1
    byUser.set(row.recipient_id ?? '', entry)
    if (!row.read) unread += 1
  }

  const before = {
    total: rows.length,
    unread,
    byType,
    byUser: [...byUser.entries()]
      .map(([repId, counts]) => ({ repId, ...counts }))
      .sort((a, b) => b.total - a.total),
  }

  // 1. Clean the active inbox.
  const { error: readError } = await client
    .from('notifications')
    .update({ read: true })
    .eq('organization_id', orgId)
    .eq('read', false)
  if (readError) throw readError

  // 2. Drop stale, already-read system noise. Actionable rows and their dedupe
  //    keys stay, so a replayed event is still recognised as a duplicate.
  const { data: deleted, error: deleteError } = await client
    .from('notifications')
    .delete()
    .eq('organization_id', orgId)
    .eq('read', true)
    .lt('created_at', cutoff)
    .in('notification_type', STALE_SYSTEM_TYPES)
    .select('id')
  if (deleteError) throw deleteError

  const { data: remaining, error: countError } = await client
    .from('notifications')
    .select('id, read')
    .eq('organization_id', orgId)
    .limit(20_000)
  if (countError) throw countError
  const afterRows = (remaining ?? []) as Array<{ id: string; read: boolean }>

  return {
    before,
    markedRead: unread,
    deleted: (deleted ?? []).length,
    after: {
      total: afterRows.length,
      unread: afterRows.filter((row) => !row.read).length,
    },
  }
}
