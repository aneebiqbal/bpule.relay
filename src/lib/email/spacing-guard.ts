import type { DbClient } from '@/lib/db/types'
/**
 * Minimum-spacing concurrency guard.
 *
 * The bug this prevents: two workers read the same `last_sent_at`, both see the
 * spacing window as elapsed, and both send. A read-then-write check cannot fix
 * that — the reads race.
 *
 * The guard is a single conditional UPDATE. Postgres takes a row lock for the
 * duration of the statement, so of two concurrent claims exactly one matches the
 * `last_send_at + spacing <= now` predicate; the other sees the value the first
 * one just wrote and fails. No advisory lock, no new table, no second read.
 *
 * Fails closed: when the column is absent (migration not applied) the claim is
 * skipped and the decision-layer spacing check still applies.
 */

export interface SpacingClaimInput {
  organizationId: string
  mailboxId: string
  minimumSpacingMinutes: number
  now?: Date
}

export interface SpacingClaimResult {
  claimed: boolean
  reason: 'claimed' | 'spacing_not_elapsed' | 'column_unavailable'
  /** When the claim failed, the instant the slot becomes available. */
  nextSendAt: string | null
}

function isMissingColumn(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  const message = String((error as { message?: string } | null)?.message ?? '')
  return code === '42703' || /column.*does not exist/i.test(message)
}

/**
 * Atomically claim the right to send from this mailbox now.
 *
 * Must be called immediately before the provider call, in the same request as
 * the send. Calling it earlier widens the window a concurrent worker can exploit.
 */
export async function claimSendSlot(
  client: DbClient,
  input: SpacingClaimInput,
): Promise<SpacingClaimResult> {
  const now = input.now ?? new Date()
  const nowIso = now.toISOString()

  // No spacing rule means nothing to claim.
  if (input.minimumSpacingMinutes <= 0) {
    return { claimed: true, reason: 'claimed', nextSendAt: null }
  }

  const threshold = new Date(now.getTime() - input.minimumSpacingMinutes * 60_000).toISOString()

  const { data, error } = await client
    .from('email_mailboxes')
    .update({ last_send_at: nowIso, updated_at: nowIso })
    .eq('id', input.mailboxId)
    .eq('organization_id', input.organizationId)
    .or(`last_send_at.is.null,last_send_at.lte.${threshold}`)
    .select('id')

  if (error) {
    if (isMissingColumn(error)) {
      // The migration has not been applied. Degrade to the decision-layer check
      // rather than blocking every send on a column that is not there yet.
      return { claimed: true, reason: 'column_unavailable', nextSendAt: null }
    }
    throw error
  }

  if (!data || data.length === 0) {
    const { data: mailbox } = await client
      .from('email_mailboxes')
      .select('last_send_at')
      .eq('id', input.mailboxId)
      .eq('organization_id', input.organizationId)
      .maybeSingle()

    const last = (mailbox?.last_send_at as string | null) ?? null
    const nextSendAt = last
      ? new Date(new Date(last).getTime() + input.minimumSpacingMinutes * 60_000).toISOString()
      : null

    return { claimed: false, reason: 'spacing_not_elapsed', nextSendAt }
  }

  return { claimed: true, reason: 'claimed', nextSendAt: null }
}

/** Release a claim when the send did not actually happen. */
export async function releaseSendSlot(
  client: DbClient,
  input: { organizationId: string; mailboxId: string; previousLastSentAt: string | null },
): Promise<void> {
  if (!input.previousLastSentAt) return
  await client
    .from('email_mailboxes')
    .update({ last_send_at: input.previousLastSentAt, updated_at: new Date().toISOString() })
    .eq('id', input.mailboxId)
    .eq('organization_id', input.organizationId)
}
