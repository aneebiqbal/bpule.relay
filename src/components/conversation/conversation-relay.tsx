'use client'

import { useCallback, useMemo } from 'react'
import type { Message } from '@/lib/domain/types'
import { analyzeReply } from '@/lib/relay/conversation-engine'
import type { RelationshipState } from '@/lib/relay/relationship-state'
import type { RelayPresenceState } from './relay-presence'
import type { RefinementChip } from './conversation-workspace'
import { ConversationWorkspace } from './conversation-workspace'

interface ConversationRelayProps {
  messages: LeadMessage[]
  relationshipState: RelationshipState
  draftText: string
  draftGoal: string | null
  isThinking: boolean
  isLoggingSent: boolean
  contactName?: string | null
  channel?: string
  company: string
  canDraft: boolean
  wordLimit?: number
  generationMode?: string
  profileId?: string | null
  proofId?: string | null
  onDraftChange: (text: string) => void
  onRefine: (chip: RefinementChip) => void
  onCopy: () => void
  onLogSent: () => void
  onPasteSave: (text: string) => void
  onPrepareDm?: () => void
  onPrepareFollowUp?: () => void
  onMarkAccepted?: () => void
  now: number
}

interface LeadMessage {
  id: string
  type: Message['type']
  direction?: 'inbound' | 'outbound' | null
  sentText?: string | null
  draftText?: string | null
  sentAt?: string | null
  createdAt: string
}

/**
 * ConversationRelay — integration layer between LeadDetail and ConversationWorkspace.
 *
 * Handles Relay's "BD partner" intelligence:
 * - analyzes client replies
 * - determines what Relay should say
 * - generates refinement chips based on conversation state
 * - never invents client messages
 */
export function ConversationRelay({
  messages,
  relationshipState,
  draftText,
  draftGoal,
  isThinking,
  isLoggingSent,
  contactName,
  channel = 'linkedin',
  company,
  canDraft,
  wordLimit = 200,
  onDraftChange,
  onRefine,
  onCopy,
  onLogSent,
  onPasteSave,
  onPrepareDm,
  onPrepareFollowUp,
  onMarkAccepted,
  now,
}: ConversationRelayProps) {


  // Find the last inbound message for analysis
  const lastInbound = useMemo(() => {
    return messages
      .filter((m) => m.direction === 'inbound' && m.sentText)
      .sort((a, b) => (b.sentAt ?? b.createdAt).localeCompare(a.sentAt ?? a.createdAt))[0] ?? null
  }, [messages])

  // Analyze the last reply if present
  const analysis = useMemo(() => {
    if (!lastInbound?.sentText) return null
    const context = {
      leadId: '',
      leadCompany: company,
      contactName: contactName ?? null,
      replyText: lastInbound.sentText,
      priorMessages: messages.map((m): Message => ({
        id: m.id,
        organizationId: '',
        leadId: '',
        repId: null,
        type: m.type,
        direction: (m.direction ?? 'outbound') as 'inbound' | 'outbound',
        sentText: m.sentText ?? null,
        draftText: m.draftText ?? null,
        sentAt: m.sentAt ?? null,
        createdAt: m.createdAt,
        modelUsed: null,
      })),
      conversationStage: (relationshipState.phase === 'won' ? 'interested' : relationshipState.phase === 'lost' ? 'new' : relationshipState.phase) as 'new' | 'contacted' | 'replied' | 'qualifying' | 'interested',
      senderProfileId: null,
    }
    return analyzeReply(lastInbound.sentText, context)
  }, [lastInbound, company, contactName, messages, relationshipState.phase])

  // Build Relay presence state from relationship state
  const presenceState: RelayPresenceState = useMemo(() => {
    if (isThinking) return 'thinking'
    if (relationshipState.kind === 'won' || relationshipState.kind === 'lost') return 'idle'
    if (relationshipState.kind === 'your_move') return 'ready'
    if (relationshipState.kind === 'their_move') return 'waiting'
    if (relationshipState.kind === 'needs_information') return 'needs_information'
    return 'idle'
  }, [isThinking, relationshipState.kind])

  // Build Relay insight from analysis
  const relayInsight = useMemo(() => {
    if (!analysis || isThinking) return null

    if (analysis.intent === 'not_interested') {
      return <span>They&apos;re not looking to move forward right now.</span>
    }
    if (analysis.intent === 'meeting_request') {
      return <span>They&apos;re ready to move forward.</span>
    }
    if (analysis.intent === 'pricing') {
      return <span>They&apos;re interested — asking about pricing. Keep this commercial.</span>
    }
    if (analysis.intent === 'objection') {
      const objection = analysis.objections[0]
      if (objection === 'pricing') {
        return <span>They&apos;re not rejecting the need. Price is the objection.</span>
      }
      return <span>They have a concern: {objection ?? 'unspecified'}. Address it honestly.</span>
    }
    if (analysis.questions.length > 0) {
      return <span>They&apos;re interested and asking about {analysis.questions.length === 1 ? 'one thing' : `${analysis.questions.length} things`}.</span>
    }
    if (analysis.intent === 'interested') {
      return <span>They&apos;re interested. Keep the conversation going.</span>
    }
    return null
  }, [analysis, isThinking])

  // Determine relay variant
  const relayVariant = useMemo(() => {
    if (!analysis) return 'default' as const
    if (analysis.intent === 'not_interested') return 'warning' as const
    if (analysis.buyingSignal || analysis.intent === 'meeting_request') return 'insight' as const
    return 'default' as const
  }, [analysis])

  // Generate refinement chips based on analysis
  const refinementChips: RefinementChip[] = useMemo(() => {
    if (!analysis || isThinking) return []
    const chips: RefinementChip[] = []

    if (analysis.questions.length > 0) {
      chips.push({ id: 'answer-all', label: 'Answer all questions', instruction: 'Address every question they asked' })
    }
    if (analysis.objections.includes('pricing')) {
      chips.push({ id: 'pricing', label: 'Answer pricing', instruction: 'Address their pricing question without inventing a number' })
    }
    if (analysis.intent === 'meeting_request') {
      chips.push({ id: 'arrange-call', label: 'Arrange a call', instruction: 'Confirm the call logistics simply' })
    }

    chips.push({ id: 'shorter', label: 'Shorter', instruction: 'Make this more concise' })
    chips.push({ id: 'warmer', label: 'Warmer', instruction: 'Make the tone warmer and more personable' })
    chips.push({ id: 'direct', label: 'More direct', instruction: 'Be more direct and to the point' })

    return chips.slice(0, 5)
  }, [analysis, isThinking])

  // Build conversation summary from messages
  const conversationSummary = useMemo(() => {
    const sentMessages = messages.filter((m) => m.sentText)
    if (sentMessages.length <= 4) return null

    const parts: string[] = []
    const stages = new Set<string>()
    sentMessages.forEach((m) => {
      if (m.direction === 'inbound' && m.sentText) {
        stages.add('replied')
      } else {
        stages.add(m.type)
      }
    })

    if (stages.has('connection')) parts.push('Connection established.')
    if (stages.has('dm')) parts.push('Initial message sent.')
    if (stages.has('replied') && analysis) {
      if (analysis.questions.length > 0) parts.push(`They asked about ${analysis.questions.length === 1 ? 'one thing' : 'several things'}.`)
      if (analysis.objections.length > 0) parts.push(`Expressed ${analysis.objections[0]} concern.`)
      if (analysis.buyingSignal) parts.push('Showing buying signals.')
    }
    if (stages.has('followup')) parts.push('Follow-up sent.')

    return parts.join(' ')
  }, [messages, analysis])

  const handleRefine = useCallback((chip: RefinementChip) => {
    onRefine(chip)
  }, [onRefine])

  return (
    <ConversationWorkspace
      messages={messages.map((m) => ({
        id: m.id,
        organizationId: '',
        leadId: '',
        repId: null,
        type: m.type as 'dm' | 'connection' | 'upwork' | 'email' | 'followup' | 'reply',
        draftText: m.draftText ?? null,
        sentText: m.sentText ?? null,
        sentAt: m.sentAt ?? null,
        modelUsed: null,
        direction: (m.direction ?? 'outbound') as 'inbound' | 'outbound',
        createdAt: m.createdAt,
      }))}
      relationshipState={relationshipState}
      draftText={draftText}
      draftGoal={draftGoal}
      draftQuestions={analysis?.questions ?? []}
      isThinking={isThinking}
      isLoggingSent={isLoggingSent}
      contactName={contactName}
      channel={channel === 'linkedin' ? 'LinkedIn' : channel}
      canDraft={canDraft}
      wordLimit={wordLimit}
      refinementChips={refinementChips}
      relayInsight={relayInsight}
      relayPresenceState={presenceState}
      relayVariant={relayVariant}
      conversationSummary={conversationSummary}
      onDraftChange={onDraftChange}
      onRefine={handleRefine}
      onCopy={onCopy}
      onLogSent={onLogSent}
      onPasteSave={onPasteSave}
      onPrepareDm={onPrepareDm}
      onPrepareFollowUp={onPrepareFollowUp}
      onMarkAccepted={onMarkAccepted}
      now={now}
      embedded
    />
  )
}
