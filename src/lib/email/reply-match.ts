/**
 * Reply-to-lead matching.
 *
 * A reply is matched by the strongest available identity, never by name or
 * subject: a shared subject line is how two different prospects get merged into
 * one conversation.
 *
 * Strength order:
 *   1. provider thread id   — the reply arrived in a thread Relay started
 *   2. In-Reply-To          — the provider named the exact outbound message
 *   3. mailbox recipient    — the reply was sent to a mailbox Relay owns
 *   4. contact address      — the reply came from a known contact point
 *
 * The decision is pure and the DB reads are separate, so matching can be tested
 * without a database and the queries can change without touching the rule.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type ReplyMatchConfidence = 'THREAD' | 'REPLY_REFERENCE' | 'MAILBOX_RECIPIENT' | 'ADDRESS_MATCH'

/** Strongest first. A candidate at a stronger level beats any weaker level. */
const CONFIDENCE_RANK: Record<ReplyMatchConfidence, number> = {
  THREAD: 4,
  REPLY_REFERENCE: 3,
  MAILBOX_RECIPIENT: 2,
  ADDRESS_MATCH: 1,
}

export interface LeadMatch {
  leadId: string
  contactPointId: string | null
  confidence: ReplyMatchConfidence
  basis: 'provider_thread' | 'in_reply_to' | 'mailbox_recipient' | 'contact_address'
}

export type ReplyMatchResult =
  | { status: 'MATCHED'; leadId: string; contactPointId: string | null; confidence: ReplyMatchConfidence; basis: LeadMatch['basis'] }
  | { status: 'REVIEW_REQUIRED'; code: 'THREAD_MISMATCH_REVIEW_REQUIRED'; reason: string; candidates: LeadMatch[] }
  | { status: 'NO_MATCH' }

/**
 * Choose a lead from candidates.
 *
 * Two candidates at the same strongest level is a mismatch, not a coin flip —
 * picking one would attach a reply to the wrong opportunity.
 */
export function decideReplyMatch(candidates: LeadMatch[]): ReplyMatchResult {
  if (candidates.length === 0) return { status: 'NO_MATCH' }

  const strongest = Math.max(...candidates.map((c) => CONFIDENCE_RANK[c.confidence]))
  const top = candidates.filter((c) => CONFIDENCE_RANK[c.confidence] === strongest)

  if (top.length > 1) {
    const leadIds = [...new Set(top.map((c) => c.leadId))]
    if (leadIds.length > 1) {
      return {
        status: 'REVIEW_REQUIRED',
        code: 'THREAD_MISMATCH_REVIEW_REQUIRED',
        reason: `${top.length} leads match at ${top[0].confidence}; the reply cannot be attributed automatically.`,
        candidates: top,
      }
    }
    // Same lead through two routes — not a mismatch.
  }

  const winner = top[0]
  return {
    status: 'MATCHED',
    leadId: winner.leadId,
    contactPointId: winner.contactPointId,
    confidence: winner.confidence,
    basis: winner.basis,
  }
}

export interface ReplyMatchInput {
  organizationId: string
  provider: string
  providerMessageId: string
  providerThreadId: string | null
  inReplyTo: string | null
  fromAddress: string | null
  /** The mailbox address the reply was sent to, when known. */
  toAddress: string | null
}

/**
 * Load every candidate and decide.
 *
 * All four queries are independent and bounded; none is per lead.
 */
export async function matchReplyToLead(
  client: SupabaseClient,
  input: ReplyMatchInput,
): Promise<ReplyMatchResult> {
  const org = input.organizationId
  const candidates: LeadMatch[] = []

  // 1. Provider thread.
  if (input.providerThreadId) {
    const { data: threadRows, error } = await client
      .from('email_messages')
      .select('lead_id, contact_point_id')
      .eq('organization_id', org)
      .eq('provider', input.provider)
      .eq('provider_thread_id', input.providerThreadId)
      .limit(5)
    if (error) throw error
    for (const row of threadRows ?? []) {
      if (row.lead_id) {
        candidates.push({
          leadId: row.lead_id as string,
          contactPointId: (row.contact_point_id as string) ?? null,
          confidence: 'THREAD',
          basis: 'provider_thread',
        })
      }
    }
  }

  // 2. In-Reply-To names the exact outbound message.
  if (input.inReplyTo && candidates.length === 0) {
    const { data: referenced, error } = await client
      .from('email_messages')
      .select('lead_id, contact_point_id')
      .eq('organization_id', org)
      .eq('provider', input.provider)
      .eq('provider_message_id', input.inReplyTo)
      .maybeSingle()
    if (error) throw error
    if (referenced?.lead_id) {
      candidates.push({
        leadId: referenced.lead_id as string,
        contactPointId: (referenced.contact_point_id as string) ?? null,
        confidence: 'REPLY_REFERENCE',
        basis: 'in_reply_to',
      })
    }
  }

  // 3. The reply was addressed to a mailbox Relay owns.
  if (input.toAddress && candidates.length === 0) {
    const { data: mailboxRows, error } = await client
      .from('email_mailboxes')
      .select('id')
      .eq('organization_id', org)
      .eq('sender_email', input.toAddress.toLowerCase())
      .limit(5)
    if (error) throw error

    for (const mailbox of mailboxRows ?? []) {
      const { data: sent, error: sentError } = await client
        .from('email_messages')
        .select('lead_id, contact_point_id')
        .eq('organization_id', org)
        .eq('mailbox_id', mailbox.id as string)
        .eq('direction', 'OUTBOUND')
        .order('sent_at', { ascending: false })
        .limit(1)
      if (sentError) throw sentError
      const row = (sent ?? [])[0]
      if (row?.lead_id) {
        candidates.push({
          leadId: row.lead_id as string,
          contactPointId: (row.contact_point_id as string) ?? null,
          confidence: 'MAILBOX_RECIPIENT',
          basis: 'mailbox_recipient',
        })
      }
    }
  }

  // 4. The reply came from a known contact point.
  if (input.fromAddress && candidates.length === 0) {
    const { data: contactRows, error } = await client
      .from('contact_points')
      .select('lead_id, id')
      .eq('organization_id', org)
      .eq('value', input.fromAddress.toLowerCase())
      .limit(5)
    if (error) throw error
    for (const row of contactRows ?? []) {
      if (row.lead_id) {
        candidates.push({
          leadId: row.lead_id as string,
          contactPointId: row.id as string,
          confidence: 'ADDRESS_MATCH',
          basis: 'contact_address',
        })
      }
    }
  }

  return decideReplyMatch(candidates)
}

/** Never log or store an address in a form that can be used to spoof a reply. */
export function normalizeReplyAddress(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim().toLowerCase()
  const address = trimmed.match(/<([^>]+)>/)?.[1] ?? trimmed
  return address.includes('@') ? address : null
}
