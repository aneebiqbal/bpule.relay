'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { cn } from 'cn'
import type { Message } from '@/lib/domain/types'
import type { RelationshipState } from '@/lib/relay/relationship-state'
import type { RelayPresenceState } from './relay-presence'
import { ConversationMessage, DraftMessage, DateSeparator } from './conversation-message'
import { RelayIntervention, RelayClaimWarning } from './relay-intervention'
import { ReplyComposer, WriteYourselfButton } from './reply-composer'
import { QuickRefinementChips, TellRelayInput } from './quick-refinement-chips'
import {
  ConversationWaitingState,
  ConversationEmptyState,
  FollowUpDue,
  ConversationSummary,
} from './conversation-waiting-state'

export interface RefinementChip {
  id: string
  label: string
  instruction: string
}

interface ConversationWorkspaceProps {
  messages: Message[]
  relationshipState: RelationshipState
  draftText: string
  draftGoal?: string | null
  draftQuestions?: string[]
  isThinking: boolean
  isLoggingSent: boolean
  contactName?: string | null
  channel?: string
  canDraft: boolean
  wordLimit?: number
  characterLimit?: number
  refinementChips?: RefinementChip[]
  relayInsight?: React.ReactNode
  relayPresenceState?: RelayPresenceState
  relayVariant?: 'default' | 'warning' | 'insight'
  conversationSummary?: string | null
  showClaimWarning?: boolean
  claimWarningReason?: string
  onDraftChange: (text: string) => void
  onRefine: (chip: RefinementChip) => void
  onCopy: () => void
  onLogSent: () => void
  onPasteSave: (text: string) => void
  onPrepareDm?: () => void
  onPrepareFollowUp?: () => void
  onMarkAccepted?: () => void
  onWriteYourself?: () => void
  now: number
  embedded?: boolean
}

function groupMessagesByDate(messages: Message[]): Array<{ label: string; messages: Message[] }> {
  const groups: Array<{ label: string; messages: Message[] }> = []
  let currentLabel = ''
  for (const msg of messages) {
    const d = new Date(msg.sentAt ?? msg.createdAt)
    const now = new Date()
    const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const diffDays = Math.round((nowDay.getTime() - dDay.getTime()) / 86_400_000)
    let label: string
    if (diffDays === 0) label = 'Today'
    else if (diffDays === 1) label = 'Yesterday'
    else if (diffDays < 7) label = d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
    else label = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    if (label !== currentLabel) {
      groups.push({ label, messages: [msg] })
      currentLabel = label
    } else {
      groups[groups.length - 1].messages.push(msg)
    }
  }
  return groups
}

/**
 * ConversationWorkspace — the canonical conversation experience.
 *
 * One component used in both Lead Detail (embedded) and Conversations page (full).
 * The conversation itself dominates. Relay assists quietly.
 */
export function ConversationWorkspace({
  messages,
  relationshipState,
  draftText,
  draftGoal,
  draftQuestions = [],
  isThinking,
  isLoggingSent,
  contactName,
  channel = 'LinkedIn',
  canDraft,
  wordLimit = 200,
  refinementChips = [],
  relayInsight,
  relayPresenceState = 'idle',
  relayVariant = 'default',
  conversationSummary,
  showClaimWarning = false,
  claimWarningReason,
  onDraftChange,
  onRefine,
  onCopy,
  onLogSent,
  onPasteSave,
  onPrepareDm,
  onPrepareFollowUp,
  onMarkAccepted,
  onWriteYourself,
  now,
  embedded = false,
}: ConversationWorkspaceProps) {
  const [tellRelay, setTellRelay] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length, draftText, isThinking])

  const handleChipClick = useCallback((chip: RefinementChip) => {
    onRefine(chip)
  }, [onRefine])

  const handleTellRelay = useCallback(() => {
    if (!tellRelay.trim()) return
    // This would be passed to the parent for AI refinement
    setTellRelay('')
  }, [tellRelay])

  // Determine if we have any messages to show
  const hasMessages = messages.some((m) => m.sentText)
  const sortedMessages = messages
    .filter((m) => m.sentText)
    .sort((a, b) => (a.sentAt ?? a.createdAt).localeCompare(b.sentAt ?? b.createdAt))
  const groupedMessages = groupMessagesByDate(sortedMessages)

  // Determine composer mode
  const isWaiting = relationshipState.kind === 'their_move' || relationshipState.kind === 'won' || relationshipState.kind === 'lost'
  const isFollowUpDue = relationshipState.phase === 'follow_up_due'

  // Terminal state — no composer needed
  const isTerminal = relationshipState.kind === 'won' || relationshipState.kind === 'lost'

  return (
    <div className={cn(
      'flex flex-col',
      embedded ? 'h-full' : 'min-h-[60vh]',
    )}>
      {/* Conversation header */}
      <div className="flex items-center justify-between pb-3 border-b border-line">
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-medium text-ink">Conversation</h2>
          {contactName && (
            <span className="text-[11px] text-stone">· {contactName}</span>
          )}
          <span className="text-[11px] text-stone capitalize">· {channel}</span>
        </div>
        {relationshipState.kind === 'their_move' && relationshipState.waitingOn && (
          <span className="flex items-center gap-1.5 text-[11px] text-stone">
            <span className="size-1.5 rounded-full bg-stone gentle-pulse" />
            Waiting on {relationshipState.waitingOn === 'connection' ? 'connection' : 'reply'}
          </span>
        )}
        {relationshipState.kind === 'your_move' && (
          <span className="flex items-center gap-1.5 text-[11px] text-orange">
            <span className="size-1.5 rounded-full bg-orange gentle-pulse" />
            Your move
          </span>
        )}
      </div>

      {/* Conversation scroll area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-4 space-y-3 scroll-smooth">
        {/* Empty state */}
        {!hasMessages && relationshipState.kind !== 'won' && relationshipState.kind !== 'lost' && (
          <ConversationEmptyState
            contactName={contactName}
            connectionAccepted={relationshipState.phase !== 'connection_due' && relationshipState.phase !== 'connection_sent'}
            onPrepareDm={onPrepareDm ?? (() => {})}
            onMarkAccepted={relationshipState.phase === 'connection_sent' ? onMarkAccepted : undefined}
          />
        )}

        {/* Waiting state when no messages yet */}
        {!hasMessages && relationshipState.kind === 'their_move' && (
          <ConversationWaitingState
            contactName={contactName}
            waitingOn={relationshipState.waitingOn ?? 'client'}
            waitingSince={relationshipState.waitingSince}
            lastActionLabel={relationshipState.lastActionLabel}
            lastActionAt={relationshipState.lastActionAt}
            onPasteReply={() => {}}
            now={now}
          />
        )}

        {/* Follow-up due banner */}
        {isFollowUpDue && !hasMessages && (
          <FollowUpDue
            contactName={contactName}
            onPrepareFollowUp={onPrepareFollowUp ?? (() => {})}
          />
        )}

        {/* Conversation summary */}
        {hasMessages && conversationSummary && sortedMessages.length > 4 && (
          <ConversationSummary summary={conversationSummary} />
        )}

        {/* Messages */}
        {hasMessages && groupedMessages.map((group) => (
          <div key={group.label}>
            <DateSeparator label={group.label} />
            <div className="space-y-2 mt-2">
              {group.messages.map((msg, idx) => (
                <ConversationMessage
                  key={msg.id}
                  message={msg}
                  contactName={contactName}
                  isLatest={idx === group.messages.length - 1 && group === groupedMessages[groupedMessages.length - 1]}
                  now={now}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Relay intervention */}
        {relayInsight && !isThinking && (
          <RelayIntervention state={relayPresenceState} variant={relayVariant}>
            {relayInsight}
          </RelayIntervention>
        )}

        {/* Relay thinking state */}
        {isThinking && (
          <RelayIntervention state="thinking">
            <span className="text-[12px] text-graphite">Analyzing their message...</span>
          </RelayIntervention>
        )}

        {/* Claim warning */}
        {showClaimWarning && claimWarningReason && (
          <RelayClaimWarning reason={claimWarningReason} />
        )}

        {/* Draft */}
        {draftText && !isTerminal && (
          <DraftMessage text={draftText} goal={draftGoal} />
        )}
      </div>

      {/* Composer area */}
      {!isTerminal && (
        <div className="border-t border-line pt-3 space-y-3">
          {/* Waiting state */}
          {isWaiting && !draftText && (
            <ConversationWaitingState
              contactName={contactName}
              waitingOn={relationshipState.waitingOn ?? 'client'}
              waitingSince={relationshipState.waitingSince}
              lastActionLabel={relationshipState.lastActionLabel}
              lastActionAt={relationshipState.lastActionAt}
              onPasteReply={() => {}}
              onLogUpdate={undefined}
              now={now}
            />
          )}

          {/* Follow-up due with composer */}
          {isFollowUpDue && !draftText && (
            <div className="space-y-2">
              <FollowUpDue
                contactName={contactName}
                onPrepareFollowUp={onPrepareFollowUp ?? (() => {})}
              />
            </div>
          )}

          {/* Draft composer */}
          {(draftText || canDraft) && (
            <div className="space-y-2">
              <ReplyComposer
                mode={draftText ? 'edit_draft' : 'waiting'}
                draftText={draftText}
                onDraftChange={onDraftChange}
                onCopy={onCopy}
                onLogSent={onLogSent}
                onPasteSave={onPasteSave}
                contactName={contactName}
                channel={channel}
                wordLimit={wordLimit}
                canSend={!!draftText}
                isThinking={isThinking}
                loading={isLoggingSent}
                goal={draftGoal}
                questionsCovered={draftQuestions.length > 0 ? draftQuestions.length : undefined}
                totalQuestions={draftQuestions.length > 0 ? draftQuestions.length : undefined}
              />

              {/* Refinement chips */}
              {refinementChips.length > 0 && draftText && (
                <QuickRefinementChips
                  chips={refinementChips}
                  activeChip={null}
                  onChipClick={handleChipClick}
                  disabled={isThinking}
                />
              )}
            </div>
          )}

          {/* Tell Relay input + Write yourself */}
          {(draftText || canDraft) && (
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <TellRelayInput
                  value={tellRelay}
                  onChange={setTellRelay}
                  onSubmit={handleTellRelay}
                  placeholder="Tell Relay... (e.g. 'mention we can start next week')"
                />
              </div>
              {onWriteYourself && (
                <WriteYourselfButton onClick={onWriteYourself} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
