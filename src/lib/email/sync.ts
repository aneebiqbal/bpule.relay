import type { DbClient } from '@/lib/db/types'
/**
 * Mailbox sync — turn provider history into Relay inbound messages.
 *
 * The webhook handles delivery events; this worker handles *replies*. Gmail push
 * notifications are not relied on because a missed push would silently lose a
 * buyer reply. Polling `fetchHistory` from the last stored history id is durable
 * and idempotent: the cursor advances only after the page is persisted, and every
 * message is keyed on its provider message id, so a repeat run cannot import the
 * same reply twice.
 *
 * Bounded: one page per mailbox per run, oldest first, cursor advanced last.
 */
import type { EmailProvider } from './providers/email-provider'
import { loadMailboxCredentials } from './mailbox'
import { matchReplyToLead, normalizeReplyAddress } from './reply-match'
import { emitAction } from '@/lib/action-ledger'

const PAGE_SIZE = 50

export interface SyncSummary {
  mailboxId: string
  scanned: number
  imported: number
  duplicates: number
  reviewRequired: number
  cursorAdvanced: boolean
  failure: string | null
}

export interface SyncMailboxInput {
  id: string
  organizationId: string
  revenueIdentityId: string
  provider: string
  senderEmail: string | null
  lastHistoryId: string | null
}

async function alreadyImported(
  client: DbClient,
  organizationId: string,
  providerMessageId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from('email_messages')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('provider_message_id', providerMessageId)
    .maybeSingle()
  if (error) throw error
  return Boolean(data)
}

/**
 * Sync one mailbox.
 *
 * Never throws for a provider failure — the summary carries it, because one
 * unhealthy mailbox must not stop the others.
 */
export async function syncMailbox(
  client: DbClient,
  mailbox: SyncMailboxInput,
  provider: EmailProvider,
): Promise<SyncSummary> {
  const summary: SyncSummary = {
    mailboxId: mailbox.id,
    scanned: 0,
    imported: 0,
    duplicates: 0,
    reviewRequired: 0,
    cursorAdvanced: false,
    failure: null,
  }

  if (!provider.fetchHistory) {
    summary.failure = 'provider_has_no_history_feed'
    return summary
  }

  try {
    // The mailbox's own address is used only to skip our own outbound copies.
    // When it is unknown, the provider-message-id dedupe below still catches
    // them: every real send is recorded with its provider_message_id, so a copy
    // we already wrote is never imported as a reply.
    const ownAddress = mailbox.senderEmail?.toLowerCase() ?? null
    const history = await provider.fetchHistory({ startHistoryId: mailbox.lastHistoryId, pageSize: PAGE_SIZE })

    summary.scanned = history.messages.length

    for (const message of history.messages) {
      const from = normalizeReplyAddress(message.fromAddress)
      // A message From the mailbox itself is our own outbound copy, not a reply.
      if (!from || (ownAddress && from === ownAddress)) continue

      if (await alreadyImported(client, mailbox.organizationId, message.providerMessageId)) {
        summary.duplicates += 1
        continue
      }

      const match = await matchReplyToLead(client, {
        organizationId: mailbox.organizationId,
        provider: mailbox.provider,
        providerMessageId: message.providerMessageId,
        providerThreadId: message.providerThreadId,
        inReplyTo: message.inReplyTo,
        fromAddress: from,
        toAddress: ownAddress,
      })

      if (match.status === 'REVIEW_REQUIRED') {
        await recordInbound(client, mailbox, message, null, 'THREAD_MISMATCH_REVIEW_REQUIRED', match.candidates.length)
        summary.reviewRequired += 1
        continue
      }

      await recordInbound(client, mailbox, message, match.status === 'MATCHED' ? match : null, 'IMPORTED', 0)
      summary.imported += 1
    }

    // Advance the cursor only after the page is persisted.
    await client
      .from('email_mailboxes')
      .update({ last_history_id: history.historyId, last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', mailbox.id)
      .eq('organization_id', mailbox.organizationId)

    summary.cursorAdvanced = Boolean(history.historyId && history.historyId !== mailbox.lastHistoryId)
    return summary
  } catch (error) {
    summary.failure = error instanceof Error ? error.message.slice(0, 300) : 'unknown'
    return summary
  }
}

async function recordInbound(
  client: DbClient,
  mailbox: SyncMailboxInput,
  message: {
    providerMessageId: string
    providerThreadId: string | null
    fromAddress: string | null
    subject: string | null
    snippet: string | null
    receivedAt: string | null
  },
  match: { leadId: string; contactPointId: string | null; confidence: string; basis: string } | null,
  ingestStatus: string,
  candidateCount: number,
): Promise<void> {
  const nowIso = new Date().toISOString()
  const { data: inserted, error } = await client
    .from('email_messages')
    .insert({
      organization_id: mailbox.organizationId,
      lead_id: match?.leadId ?? null,
      revenue_identity_id: mailbox.revenueIdentityId,
      mailbox_id: mailbox.id,
      contact_point_id: match?.contactPointId ?? null,
      direction: 'INBOUND',
      category: 'REPLY',
      idempotency_key: `inbound:${mailbox.provider}:${message.providerMessageId}`,
      subject: message.subject,
      body: message.snippet,
      provider: mailbox.provider,
      provider_message_id: message.providerMessageId,
      provider_thread_id: message.providerThreadId,
      delivery_status: 'REPLIED',
      received_at: message.receivedAt ?? nowIso,
      last_event_at: nowIso,
      updated_at: nowIso,
    })
    .select('id')
    .single()
  if (error) throw error

  // §21/§22: one reply authority — REPLY_RECEIVED + channel=email. The poller
  // path has no messages row, so the event links by metadata, not message_id.
  if (match?.leadId && inserted?.id) {
    await emitAction({
      client,
      orgId: mailbox.organizationId,
      actionType: 'REPLY_RECEIVED',
      actorType: 'integration',
      actorId: null,
      leadId: match.leadId,
      channel: 'email',
      executionStatus: 'delivered',
      metadata: {
        direction: 'inbound',
        source: 'email_sync',
        revenueIdentityId: mailbox.revenueIdentityId,
        providerMessageId: message.providerMessageId,
        emailMessageId: inserted.id,
      },
      idempotencyKey: `reply_received:email:${inserted.id}`,
    })
  }

  await client.from('email_delivery_events').insert({
    organization_id: mailbox.organizationId,
    provider_event_id: `inbound:${message.providerMessageId}`,
    event_type: ingestStatus,
    payload: {
      providerMessageId: message.providerMessageId,
      leadId: match?.leadId ?? null,
      confidence: match?.confidence ?? null,
      basis: match?.basis ?? null,
      candidateCount,
    },
    occurred_at: nowIso,
  })
}

/**
 * Sync every connected mailbox for an organization.
 *
 * Mailboxes are processed concurrently and bounded, because a serial
 * mailbox-by-mailbox waterfall does not scale across reps.
 */
export async function syncOrganizationMailboxes(
  client: DbClient,
  organizationId: string,
  concurrency = 4,
): Promise<SyncSummary[]> {
  const { data: mailboxes, error } = await client
    .from('email_mailboxes')
    .select('id, organization_id, revenue_identity_id, provider, sender_email, last_history_id, health')
    .eq('organization_id', organizationId)
    .eq('health', 'CONNECTED')
    .limit(50)

  if (error) throw error

  const results: SyncSummary[] = []
  const queue = [...(mailboxes ?? [])]
  const { createGmailProvider } = await import('@/lib/email/providers/gmail')

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    for (;;) {
      const mailbox = queue.shift()
      if (!mailbox) return

      const credentials = await loadMailboxCredentials(client, organizationId, mailbox.revenue_identity_id as string)
      if (!credentials) {
        results.push({
          mailboxId: mailbox.id as string,
          scanned: 0,
          imported: 0,
          duplicates: 0,
          reviewRequired: 0,
          cursorAdvanced: false,
          failure: 'reauth_required',
        })
        continue
      }

      const provider = createGmailProvider({
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        expiresAt: credentials.expiresAt,
        scope: credentials.scope,
      })

      results.push(
        await syncMailbox(client, {
          id: mailbox.id as string,
          organizationId,
          revenueIdentityId: mailbox.revenue_identity_id as string,
          provider: mailbox.provider as string,
          senderEmail: (mailbox.sender_email as string | null) ?? null,
          lastHistoryId: (mailbox.last_history_id as string | null) ?? null,
        }, provider),
      )
    }
  })

  await Promise.all(workers)
  return results
}
