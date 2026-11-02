import type { DbClient } from '@/lib/db/types'
/**
 * The one notification writer. At most one row per (org, recipient,
 * dedupe_key): checked before insert, and a unique violation (once
 * 20261101140000_notification_dedupe.sql is applied) also counts as
 * "already delivered". Returns whether a new notification was stored —
 * callers never report success for a notification that was not written.
 */
import { isSchemaNotReady } from '@/lib/operations/db-errors'
import { notificationsFor, type OperationalEvent } from '@/lib/notifications/model'

export interface NotifyOnceInput {
  organizationId: string
  recipientId: string
  type: string
  title: string
  body: string
  link: string
  dedupeKey: string
}

export type DeliveryResult = 'delivered' | 'duplicate' | 'unavailable' | 'failed' | 'skipped'

export async function notifyOnce(client: DbClient, input: NotifyOnceInput): Promise<boolean> {
  return (await deliver(client, input)) === 'delivered'
}

export async function deliver(client: DbClient, input: NotifyOnceInput): Promise<DeliveryResult> {
  const { data: existing, error: readError } = await client
    .from('notifications')
    .select('id')
    .eq('organization_id', input.organizationId)
    .eq('recipient_id', input.recipientId)
    .eq('dedupe_key', input.dedupeKey)
    .limit(1)
    .maybeSingle()
  if (readError) return isSchemaNotReady(readError) ? 'unavailable' : 'failed'
  if (existing) return 'duplicate'

  const { error } = await client.from('notifications').insert({
    organization_id: input.organizationId,
    recipient_id: input.recipientId,
    notification_type: input.type,
    title: input.title,
    body: input.body,
    link: input.link,
    dedupe_key: input.dedupeKey,
  })
  if (!error) return 'delivered'
  if ((error as { code?: string }).code === '23505') return 'duplicate'
  return isSchemaNotReady(error) ? 'unavailable' : 'failed'
}

/**
 * Rule + delivery in one call. Non-meaningful events are skipped. When an
 * event has more than one recipient (lead reassignment), the result is the
 * primary recipient's.
 */
export async function notifyForEvent(
  client: DbClient,
  organizationId: string,
  event: OperationalEvent,
): Promise<DeliveryResult> {
  const intents = notificationsFor(event)
  if (intents.length === 0) return 'skipped'
  const results: DeliveryResult[] = []
  for (const intent of intents) results.push(await deliver(client, { organizationId, ...intent }))
  return results[0]
}
