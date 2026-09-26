'use client'

import { cn } from 'cn'
import type { Message } from '@/lib/domain/types'

interface ConversationMessageProps {
  message: Message
  contactName?: string | null
  isLatest?: boolean
  now: number
}

function formatTime(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/**
 * ConversationMessage — renders a single message in the conversation thread.
 *
 * Inbound (them): right-aligned, subtle cobalt accent
 * Outbound (us): left-aligned, neutral
 * Draft: clearly labeled, visually distinct
 */
export function ConversationMessage({ message, contactName, isLatest }: ConversationMessageProps) {
  const isInbound = message.direction === 'inbound'
  const senderName = isInbound ? (contactName ?? 'They') : 'You'

  return (
    <div
      className={cn(
        'message-entrance group',
        isInbound ? 'flex justify-end' : 'flex justify-start',
      )}
    >
      <div className={cn(
        'max-w-[80%] min-w-0',
        isInbound ? 'items-end' : 'items-start',
      )}>
        <div className={cn(
          'rounded-md px-3.5 py-2.5',
          isInbound
            ? isLatest
              ? 'bg-cobalt/8 border border-cobalt/20'
              : 'bg-cobalt/5 border border-cobalt/10'
            : 'bg-bone-raised/60 border border-line',
        )}>
          <p className="text-[13px] leading-relaxed text-ink whitespace-pre-wrap">
            {message.sentText || message.draftText}
          </p>
        </div>
        <div className={cn(
          'mt-1 flex items-center gap-1.5 px-1 text-[10px] text-stone',
          isInbound ? 'justify-end' : 'justify-start',
        )}>
          <span className="font-medium">{senderName}</span>
          <span aria-hidden="true">·</span>
          <span>{formatTime(message.sentAt ?? message.createdAt)}</span>
          {message.type === 'followup' && (
            <>
              <span aria-hidden="true">·</span>
              <span className="capitalize">follow-up</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * DraftMessage — clearly labeled draft, visually distinct from sent/received.
 */
export function DraftMessage({ text, goal }: { text: string; goal?: string | null }) {
  return (
    <div className="message-entrance flex justify-start">
      <div className="max-w-[85%] min-w-0">
        <div className="rounded-md border border-dashed border-orange/30 bg-orange/[0.03] px-3.5 py-2.5">
          {goal && (
            <p className="mb-2 text-[10px] uppercase tracking-[0.12em] text-orange">Draft · {goal}</p>
          )}
          {!goal && (
            <p className="mb-2 text-[10px] uppercase tracking-[0.12em] text-orange/60">Draft</p>
          )}
          <p className="text-[13px] leading-relaxed text-ink whitespace-pre-wrap">
            {text}
          </p>
        </div>
        <div className="mt-1 flex items-center gap-1.5 px-1 text-[10px] text-stone">
          <span className="font-medium text-orange/70">Relay</span>
          <span aria-hidden="true">·</span>
          <span>suggested</span>
        </div>
      </div>
    </div>
  )
}

/**
 * DateSeparator — visual divider between message groups by date.
 */
export function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-2" aria-hidden="true">
      <div className="h-px flex-1 bg-line" />
      <span className="text-[10px] uppercase tracking-[0.14em] text-stone">{label}</span>
      <div className="h-px flex-1 bg-line" />
    </div>
  )
}
