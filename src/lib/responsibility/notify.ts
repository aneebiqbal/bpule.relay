import type { DbClient } from '@/lib/db/types'
import { notifyOnce } from '@/lib/notifications/deliver'
import {
  acknowledgementDedupeKey,
  dueNotificationStage,
} from './ack-policy'
import type { ResponsibilityAcknowledgementView } from './load'

/**
 * Lazy escalation emit.
 *
 * There is no frequent cron in this product, so stages are derived from
 * `assigned_at` and emitted when a surface that shows the responsibility is
 * read. `notifyOnce` dedupes per (assignment, stage, recipient), so each stage
 * fires at most once and acknowledgement stops all later stages.
 */

function subjectLabel(ack: ResponsibilityAcknowledgementView): string {
  if (ack.subject === 'PRIMARY') return 'Permanent owner'
  if (ack.mode === 'SHARED') return 'Temporary · Shared coverage'
  if (ack.mode === 'REPLACE') return 'Temporary · Replacing the primary'
  return 'Temporary coverage'
}

function repCopy(ack: ResponsibilityAcknowledgementView, stage: string): { title: string; body: string } {
  const label = `${ack.profileName}${ack.channel ? ` · ${ack.channel}` : ''}`
  if (stage === 'NEW') {
    return {
      title: 'New responsibility assigned',
      body: `${label} — ${subjectLabel(ack)}. Your ownership and access are unchanged.`,
    }
  }
  return {
    title: 'Action required',
    body: `${label} was assigned ${ack.elapsedMinutes} minutes ago and is not acknowledged yet.`,
  }
}

function adminCopy(ack: ResponsibilityAcknowledgementView, repName: string, urgent: boolean): { title: string; body: string } {
  const label = `${ack.profileName}${ack.channel ? ` · ${ack.channel}` : ''}`
  return {
    title: urgent ? 'Urgent: unacknowledged responsibility' : 'Unacknowledged responsibility',
    body: `${repName} has not acknowledged ${label} (${subjectLabel(ack)}) for ${ack.elapsedMinutes} minutes.`,
  }
}

export async function emitDueAcknowledgementNotifications(input: {
  client: DbClient
  orgId: string
  acknowledgements: ResponsibilityAcknowledgementView[]
  now: string
  adminRepIds: string[]
}): Promise<void> {
  for (const ack of input.acknowledgements) {
    const stage = dueNotificationStage(ack.assignedAt, input.now, ack.acknowledgedAt)
    if (!stage || !ack.sourceRowId) continue

    if (stage === 'NEW' || stage === 'REMIND') {
      const copy = repCopy(ack, stage)
      await notifyOnce(input.client, {
        organizationId: input.orgId,
        recipientId: ack.repId,
        type: 'responsibility_acknowledgement',
        title: copy.title,
        body: copy.body,
        link: '/dashboard',
        dedupeKey: acknowledgementDedupeKey(ack.sourceRowId, stage, ack.repId),
      })
      continue
    }

    for (const adminRepId of input.adminRepIds) {
      const copy = adminCopy(ack, ack.repId, stage === 'URGENT')
      await notifyOnce(input.client, {
        organizationId: input.orgId,
        recipientId: adminRepId,
        type: 'responsibility_acknowledgement',
        title: copy.title,
        body: copy.body,
        link: '/team',
        dedupeKey: acknowledgementDedupeKey(ack.sourceRowId, stage, adminRepId),
      })
    }
  }
}

/** Admin/owner rep ids for the org — the escalation recipients. */
export async function listAdminRepIds(client: DbClient, orgId: string): Promise<string[]> {
  const { data, error } = await client
    .from('reps')
    .select('id')
    .eq('organization_id', orgId)
    .in('role', ['admin', 'manager'])
    .limit(200)
  if (error) throw error
  return ((data ?? []) as Array<{ id: string }>).map((row) => row.id)
}
