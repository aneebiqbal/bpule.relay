'use client'

/**
 * Lead preview drawer — the fast inspection surface for the Leads table.
 *
 * Row click opens this instead of a full-page navigation. It loads a bounded
 * record context first, then the Conversation tab lazily; the full record
 * stays one link away. Focus is trapped while open and returned on close.
 *
 * The panel is keyed by lead id, so switching rows resets its state without a
 * synchronous setState in an effect.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, MessagesSquare, UserPlus, X } from 'lucide-react'
import { cn } from 'cn'
import { Drawer } from '@/components/ui/drawer'
import { V3ActivityRow, V3Avatar, V3PriorityMark, V3SectionError, V3Skeleton } from '@/components/v3/primitives'
import { formatRelativeTime } from '@/lib/ui/time'
import type { LeadPreviewData } from '@/lib/leads/preview'

type Tab = 'overview' | 'conversation' | 'activity'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'conversation', label: 'Conversation' },
  { id: 'activity', label: 'Activity' },
]

interface MessageRow {
  id: string
  type: string | null
  direction: string | null
  sent_text: string | null
  thread_status: string | null
  sent_at: string | null
  created_at: string | null
}

/** Keeps Tab inside the panel — the drawer's Escape/restore come from Drawer. */
function useFocusTrap(active: boolean, panelRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!active) return
    const container = panelRef.current
    if (!container) return
    const root: HTMLElement = container
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Tab') return
      const focusable = root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    root.addEventListener('keydown', onKeyDown)
    return () => root.removeEventListener('keydown', onKeyDown)
  }, [active, panelRef])
}

export function LeadPreviewDrawer({
  leadId,
  open,
  onClose,
  now,
}: {
  leadId: string | null
  open: boolean
  onClose: () => void
  now: number
}) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  useFocusTrap(open, panelRef)

  if (!open) return null

  return (
    <Drawer open={open} onClose={onClose} side="right" className="sm:w-[560px]" title="Lead">
      <div ref={panelRef} className="flex h-full flex-col">
        {leadId ? (
          <LeadPreviewPanel key={leadId} leadId={leadId} onClose={onClose} now={now} />
        ) : null}
      </div>
    </Drawer>
  )
}

function LeadPreviewPanel({
  leadId,
  onClose,
  now,
}: {
  leadId: string
  onClose: () => void
  now: number
}) {
  const [preview, setPreview] = useState<LeadPreviewData | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [retryToken, setRetryToken] = useState(0)
  const [tab, setTab] = useState<Tab>('overview')
  const [messages, setMessages] = useState<MessageRow[] | null>(null)
  const [messagesError, setMessagesError] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/leads/${leadId}/preview`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Could not load the lead.')
        return (await res.json()) as LeadPreviewData
      })
      .then((data) => {
        if (cancelled) return
        setPreview(data)
        setStatus('ready')
      })
      .catch(() => {
        if (cancelled) return
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [leadId, retryToken])

  const loadMessages = useCallback(() => {
    if (!leadId || messages || messagesError) return
    fetch(`/api/leads/${leadId}/messages`)
      .then(async (res) => {
        if (!res.ok) throw new Error('failed')
        return (await res.json()) as { messages?: MessageRow[]; available?: boolean }
      })
      .then((data) => {
        if (data.available === false) {
          setMessagesError(true)
          return
        }
        setMessages(data.messages ?? [])
      })
      .catch(() => setMessagesError(true))
  }, [leadId, messages, messagesError])

  useEffect(() => {
    if (tab === 'conversation') loadMessages()
  }, [tab, loadMessages])

  const retry = () => {
    setPreview(null)
    setRetryToken((token) => token + 1)
  }

  if (status === 'error') {
    return (
      <div className="p-5">
        <V3SectionError onRetry={retry} />
      </div>
    )
  }

  if (status !== 'ready' || !preview) {
    return (
      <div className="space-y-3 p-5">
        <V3Skeleton variant="row" />
        <V3Skeleton variant="metric" />
        <V3Skeleton variant="block" />
      </div>
    )
  }

  return (
    <>
      <div className="border-b border-line px-5 py-4">
        <div className="flex items-start gap-3">
          <V3Avatar name={preview.name ?? preview.company ?? '?'} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-medium text-ink">
              {preview.name ?? 'Unnamed lead'}
            </p>
            {preview.roleLine || preview.company ? (
              <p className="truncate text-[12px] text-graphite">
                {[preview.roleLine, preview.company].filter(Boolean).join(' · ')}
              </p>
            ) : null}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <V3PriorityMark priority={preview.priority} />
              <span className="text-[12px] text-graphite">{preview.stage}</span>
              {typeof preview.score === 'number' ? (
                <span className="text-[12px] tabular-nums text-ink">{preview.score}/10</span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="rounded-md p-1 text-stone transition-colors hover:bg-bone hover:text-ink"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link
            href={preview.nextAction.href}
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-md bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98]"
          >
            {preview.nextAction.label}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
          <Link
            href={`/leads/${preview.id}?tab=tasks`}
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-bone"
          >
            <UserPlus className="size-3.5" aria-hidden />
            Task
          </Link>
          <Link
            href={`/leads/${preview.id}?tab=conversation`}
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-bone"
          >
            <MessagesSquare className="size-3.5" aria-hidden />
            Open in Inbox
          </Link>
        </div>
      </div>

      <div role="tablist" aria-label="Lead sections" className="flex gap-1 border-b border-line px-3">
        {TABS.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              'rounded-t-md px-3 py-2 text-[12px] font-medium transition-colors',
              tab === item.id ? 'border-b-2 border-ink text-ink' : 'text-graphite hover:text-ink',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'overview' ? (
          <dl className="divide-y divide-line">
            <PreviewField label="Next action">
              <Link href={preview.nextAction.href} onClick={onClose} className="text-[13px] font-medium text-orange hover:underline">
                {preview.nextAction.label}
              </Link>
            </PreviewField>
            <PreviewField label="Owner">
              {preview.owner ? preview.owner.name : <UnknownValue />}
            </PreviewField>
            <PreviewField label="Sending profile">
              {preview.profile ? preview.profile.name : <UnknownValue />}
            </PreviewField>
            <PreviewField label="Buyer intent">
              {preview.intent ? preview.intent.toUpperCase() : <UnknownValue />}
            </PreviewField>
            <PreviewField label="Open tasks">
              {preview.openTaskCount > 0 ? `${preview.openTaskCount}` : 'None'}
            </PreviewField>
            <PreviewField label="Last activity">
              {preview.lastActivityAt ? (
                <span suppressHydrationWarning>{formatRelativeTime(preview.lastActivityAt, now)}</span>
              ) : (
                <UnknownValue />
              )}
            </PreviewField>
          </dl>
        ) : null}

        {tab === 'conversation' ? (
          <div className="p-4">
            {messagesError ? (
              <V3SectionError
                onRetry={() => {
                  setMessagesError(false)
                  setMessages(null)
                  loadMessages()
                }}
              />
            ) : messages === null ? (
              <div className="space-y-2">
                <V3Skeleton variant="row" />
                <V3Skeleton variant="row" />
              </div>
            ) : messages.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-[13px] text-graphite">
                No messages yet.
              </p>
            ) : (
              <ol className="space-y-2.5">
                {messages.map((message) => (
                  <li
                    key={message.id}
                    className={cn(
                      'rounded-lg border border-line px-3 py-2',
                      message.direction === 'inbound' ? 'bg-bone-raised' : 'bg-bone',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.1em] text-stone">
                      <span>{message.direction === 'inbound' ? 'Prospect' : 'You'}</span>
                      <span suppressHydrationWarning>
                        {formatRelativeTime(message.sent_at ?? message.created_at ?? '', now)}
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] text-ink">{message.sent_text}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : null}

        {tab === 'activity' ? (
          <ul>
            {preview.events.length === 0 ? (
              <li className="px-4 py-8 text-center text-[13px] text-graphite">No activity yet.</li>
            ) : (
              preview.events.map((event) => (
                <V3ActivityRow key={event.id} time={formatRelativeTime(event.at, now)} label={event.label} />
              ))
            )}
          </ul>
        ) : null}
      </div>

      <div className="border-t border-line px-5 py-3">
        <Link
          href={`/leads/${preview.id}`}
          onClick={onClose}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink transition-colors hover:text-orange"
        >
          Open full record
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </>
  )
}

function PreviewField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-2.5">
      <dt className="shrink-0 text-[12px] text-stone">{label}</dt>
      <dd className="min-w-0 text-right text-[13px] text-ink">{children}</dd>
    </div>
  )
}

/** Unknown is never zero and never a fabricated value. */
function UnknownValue() {
  return <span className="text-[12px] text-stone">Not stated</span>
}
