/**
 * Reconciliation for a send the provider accepted but Relay failed to record.
 *
 * This is the failure mode that cannot be retried naively: the email is already
 * in the recipient's inbox, so a plain retry sends a second copy. The only safe
 * recovery is to rebuild the local record from the provider's own message
 * identity, which was persisted on the attempt row the moment the provider
 * accepted.
 *
 * The operation is idempotent by construction — it keys on
 * (organization_id, provider, provider_message_id), so running it twice, or
 * running it after a successful write, changes nothing.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { mapEmailMessage } from './mappers'
import type { EmailMessageMeta } from '@/lib/domain/types'

const PERSIST_FAILED = 'persist_failed_after_provider_accept'

interface ReconcileInput {
  organizationId: string
  provider: string
  providerMessageId: string
}

interface AttemptRow {
  id: string
  lead_id: string | null
  prepared_draft_id: string | null
  revenue_identity_id: string | null
  idempotency_key: string
  status: string
  email_message_id: string | null
  failure_reason: string | null
}

export interface ReconcileResult {
  reconciled: boolean
  reason: 'no_accepted_send' | 'already_recorded' | 'missing_draft' | 'recorded'
  emailMessage: EmailMessageMeta | null
}

export async function reconcileAcceptedSend(
  client: SupabaseClient,
  input: ReconcileInput,
): Promise<ReconcileResult> {
  const { data: existing } = await client
    .from('email_messages')
    .select('id')
    .eq('organization_id', input.organizationId)
    .eq('provider', input.provider)
    .eq('provider_message_id', input.providerMessageId)
    .maybeSingle()

  if (existing) {
    const { data: row } = await client
      .from('email_messages')
      .select('*')
      .eq('id', existing.id as string)
      .single()
    return { reconciled: false, reason: 'already_recorded', emailMessage: mapEmailMessage(row as Record<string, unknown>) }
  }

  const { data: attempt, error: attemptError } = await client
    .from('email_send_attempts')
    .select('id, lead_id, prepared_draft_id, revenue_identity_id, idempotency_key, status, email_message_id, failure_reason')
    .eq('organization_id', input.organizationId)
    .eq('provider_message_id', input.providerMessageId)
    .maybeSingle()

  if (attemptError) throw attemptError
  const row = attempt as AttemptRow | null
  if (!row || !row.lead_id || !row.prepared_draft_id) {
    return { reconciled: false, reason: 'no_accepted_send', emailMessage: null }
  }

  const { data: draftRow, error: draftError } = await client
    .from('prepared_email_drafts')
    .select('id, lead_id, revenue_identity_id, contact_point_id, contact_email, subject, body, is_followup')
    .eq('organization_id', input.organizationId)
    .eq('id', row.prepared_draft_id)
    .maybeSingle()

  if (draftError) throw draftError
  if (!draftRow) return { reconciled: false, reason: 'missing_draft', emailMessage: null }

  const d = draftRow as Record<string, unknown>
  const nowIso = new Date().toISOString()
  const { data: inserted, error: insertError } = await client
    .from('email_messages')
    .insert({
      organization_id: input.organizationId,
      lead_id: row.lead_id,
      prepared_draft_id: row.prepared_draft_id,
      revenue_identity_id: row.revenue_identity_id ?? (d.revenue_identity_id as string),
      contact_point_id: (d.contact_point_id as string) ?? null,
      direction: 'OUTBOUND',
      category: d.is_followup ? 'FOLLOW_UP' : 'FIRST_EMAIL',
      idempotency_key: row.idempotency_key,
      subject: (d.subject as string) ?? '',
      body: (d.body as string) ?? '',
      provider: input.provider,
      provider_message_id: input.providerMessageId,
      delivery_status: 'SENT',
      sent_at: nowIso,
      last_event_at: nowIso,
      updated_at: nowIso,
    })
    .select('*')
    .maybeSingle()

  if (insertError) {
    // Another worker reconciled the same send first. That row is authoritative.
    if ((insertError as { code?: string }).code === '23505') {
      const { data: raced } = await client
        .from('email_messages')
        .select('*')
        .eq('organization_id', input.organizationId)
        .eq('idempotency_key', row.idempotency_key)
        .maybeSingle()
      if (raced) {
        return { reconciled: false, reason: 'already_recorded', emailMessage: mapEmailMessage(raced as Record<string, unknown>) }
      }
    }
    throw insertError
  }

  await client
    .from('email_send_attempts')
    .update({
      status: 'SENT',
      email_message_id: (inserted as Record<string, unknown>).id as string,
      failure_reason: row.failure_reason === PERSIST_FAILED ? null : row.failure_reason,
      updated_at: nowIso,
    })
    .eq('id', row.id)

  return {
    reconciled: true,
    reason: 'recorded',
    emailMessage: mapEmailMessage(inserted as Record<string, unknown>),
  }
}
