import { createScoutStore } from '@/lib/store'
import { computeRelationshipState } from '@/lib/relay/relationship-state'
import { ConversationsClient } from './conversations-client'
import type { Lead } from '@/lib/domain/types'

export const dynamic = 'force-dynamic'

const now = Date.now()

interface ConversationSummary {
  id: string
  company: string
  contactName: string | null
  contactTitle: string | null
  source: string | null
  status: string
  relationshipState: ReturnType<typeof computeRelationshipState>
  lastMessageText: string | null
  lastMessageAt: string | null
  messageCount: number
}

/**
 * Conversations page — full workspace version of the conversation experience.
 * Uses the same canonical components as Lead Detail.
 */
export default async function ConversationsPage() {
  const store = await createScoutStore()

  // Get all leads — filter to those with messages or accepted connections
  const leads: Lead[] = await store.fetchLeadsAll(true, false)

  const summaries: ConversationSummary[] = []

  for (const lead of leads) {
    // For Lead (not LeadDetail), fetch details only for those that qualify
    const hasAccepted = lead.connectionAcceptedAt != null
    if (!hasAccepted) continue

    const detail = await store.getLead(lead.id)
    if (!detail) continue

    const hasMessages = detail.messages.some((m) => m.sentText)
    if (!hasMessages && !hasAccepted) continue

    const sortedMessages = detail.messages
      .filter((m) => m.sentText)
      .sort((a, b) => (b.sentAt ?? b.createdAt).localeCompare(a.sentAt ?? a.createdAt))
    const lastMessage = sortedMessages[0] ?? null

    summaries.push({
      id: lead.id,
      company: lead.company,
      contactName: lead.contactName,
      contactTitle: lead.contactTitle,
      source: lead.source ?? null,
      status: lead.status,
      relationshipState: computeRelationshipState(detail, now),
      lastMessageText: lastMessage?.sentText ?? null,
      lastMessageAt: lastMessage?.sentAt ?? null,
      messageCount: detail.messages.filter((m) => m.sentText).length,
    })
  }

  // Sort: your_move first, then by most recent message
  summaries.sort((a, b) => {
    const aYours = a.relationshipState.kind === 'your_move' ? 0 : 1
    const bYours = b.relationshipState.kind === 'your_move' ? 0 : 1
    if (aYours !== bYours) return aYours - bYours
    return (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '')
  })

  return (
    <ConversationsClient
      conversations={summaries}
      now={now}
    />
  )
}
