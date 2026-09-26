'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Copy, Check, Send, Pencil, MessageSquare } from 'lucide-react'

export type ComposerMode = 'paste_reply' | 'edit_draft' | 'write_manually' | 'waiting'

interface ReplyComposerProps {
  mode: ComposerMode
  draftText: string
  onDraftChange: (text: string) => void
  onCopy: () => void
  onLogSent: () => void
  onPasteSave: (text: string) => void
  contactName?: string | null
  channel?: string
  characterLimit?: number
  wordLimit?: number
  canSend?: boolean
  isThinking?: boolean
  loading?: boolean
  goal?: string | null
  questionsCovered?: number
  totalQuestions?: number
}

function count(kind: 'words' | 'chars', text: string): number {
  if (kind === 'chars') return text.length
  return text.trim().split(/\s+/).filter(Boolean).length
}

/**
 * ReplyComposer — premium composer with paste/edit/write/waiting states.
 *
 * Large enough to comfortably edit. Auto-growing. Excellent typography.
 * Clear character count only when channel requires it.
 */
export function ReplyComposer({
  mode,
  draftText,
  onDraftChange,
  onCopy,
  onLogSent,
  onPasteSave,
  contactName,
  channel = 'LinkedIn',
  characterLimit,
  wordLimit,
  canSend = false,
  isThinking = false,
  loading = false,
  goal,
  questionsCovered,
  totalQuestions,
}: ReplyComposerProps) {
  const [copied, setCopied] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const limit = wordLimit ?? characterLimit ?? 200
  const limitKind = wordLimit ? 'words' : 'chars'
  const currentCount = count(limitKind, draftText)
  const nearLimit = currentCount >= limit * 0.9
  const overLimit = currentCount > limit

  const handleCopy = useCallback(async () => {
    onCopy()
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [onCopy])

  useEffect(() => {
    if (mode === 'edit_draft' && textareaRef.current) {
      textareaRef.current.focus()
      const len = textareaRef.current.value.length
      textareaRef.current.setSelectionRange(len, len)
    }
  }, [mode, draftText])

  if (mode === 'waiting') {
    return null
  }

  if (mode === 'paste_reply') {
    return (
      <div className="rounded-lg border border-line bg-bone-raised/30 p-3">
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare className="size-3.5 text-orange" />
          <p className="text-[12px] font-medium text-ink">
            Paste {contactName ?? 'their'} reply
          </p>
          <span className="text-[10px] text-stone">· {channel}</span>
        </div>
        <Textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          rows={4}
          className="text-[13px] bg-transparent border-line focus:border-orange/40"
          placeholder={`Paste ${contactName ?? 'their'} message here...`}
          disabled={loading}
        />
        <div className="mt-2 flex items-center justify-between">
          <Button
            variant="orange"
            size="sm"
            onClick={() => onPasteSave(pasteText)}
            disabled={loading || !pasteText.trim()}
            loading={loading}
          >
            <Send className="size-3" />
            Add to conversation
          </Button>
          <span className="text-[10px] text-stone">
            {pasteText.trim().split(/\s+/).filter(Boolean).length} words
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {goal && (
        <div className="flex items-start gap-2 rounded-md bg-bone-raised/20 px-3 py-2">
          <span className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-stone shrink-0">Goal</span>
          <span className="text-[12px] text-ink">{goal}</span>
        </div>
      )}

      <div className={cn(
        'rounded-lg border bg-bone-raised/20 transition-colors duration-200',
        overLimit ? 'border-status-danger/40' : 'border-line',
      )}>
        <Textarea
          ref={textareaRef}
          value={draftText}
          onChange={(e) => onDraftChange(e.target.value)}
          rows={5}
          className={cn(
            'min-h-[120px] max-h-[400px] resize-y border-0 bg-transparent px-3.5 py-3 text-[14px] leading-relaxed shadow-none focus-visible:ring-0',
            'placeholder:text-stone',
          )}
          placeholder={mode === 'write_manually' ? 'Write your message...' : 'Your draft appears here. Edit freely.'}
          disabled={isThinking}
        />

        <div className="flex items-center justify-between border-t border-line px-3.5 py-2">
          <div className="flex items-center gap-3">
            <span className={cn(
              'font-mono text-[11px] transition-colors',
              overLimit ? 'text-status-danger' : nearLimit ? 'text-status-warning' : 'text-stone',
            )}>
              {currentCount} / {limit} {limitKind}
            </span>
            {totalQuestions && totalQuestions > 0 && (
              <span className="text-[10px] text-stone">
                Covers {questionsCovered ?? 0}/{totalQuestions} questions
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              disabled={!draftText.trim()}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] transition-all duration-150',
                copied
                  ? 'bg-status-success/10 text-status-success'
                  : 'text-graphite hover:bg-bone-raised hover:text-ink',
              )}
            >
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>

            {canSend && (
              <Button
                variant="orange"
                size="sm"
                onClick={onLogSent}
                disabled={loading || !draftText.trim()}
                loading={loading}
              >
                <Send className="size-3" />
                Log as Sent
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * WriteYourselfButton — allows manual response without penalty.
 */
export function WriteYourselfButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-[12px] text-graphite transition-colors hover:text-ink"
    >
      <Pencil className="size-3" />
      Write yourself
    </button>
  )
}
