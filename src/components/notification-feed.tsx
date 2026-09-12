'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Bell, MessageCircle, X } from 'lucide-react'
import { cn } from 'cn'

export interface NotificationItem {
  id: string
  type: 'reply' | 'followup_eligible'
  leadId: string | null
  company: string | null
  createdAt: string
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.round(ms / 60_000)
  if (mins < 60) return `${Math.max(mins, 1)}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export function NotificationFeed({ initial }: { initial: NotificationItem[] }) {
  const [items, setItems] = useState(initial)
  const [dismissing, setDismissing] = useState<string | null>(null)

  async function dismiss(id: string) {
    setDismissing(id)
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setItems((prev) => prev.filter((n) => n.id !== id))
    } catch {
      // Leave it in the list; the rep can try again.
    } finally {
      setDismissing(null)
    }
  }

  if (items.length === 0) return null

  return (
    <section className="overflow-hidden rounded-[1.25rem] border border-line/80 bg-surface-raised">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-line/60 bg-paper-tint/30 px-5 py-3">
        <div className="relative">
          <Bell className="size-4 text-gold" aria-hidden="true" />
          <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-gold gentle-pulse" />
        </div>
        <h2 className="text-sm font-medium text-ink">Since you last checked</h2>
        <span className="ml-auto rounded-full bg-gold/10 px-2 py-0.5 text-mono-medium text-[10px] font-medium text-gold">
          {items.length}
        </span>
      </div>

      {/* Items */}
      <ul className="divide-y divide-line/50">
        {items.map((n, i) => (
          <li
            key={n.id}
            className={cn(
              'reveal-up flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-paper-tint/30',
              dismissing === n.id && 'opacity-40',
            )}
            style={{ animationDelay: `${i * 0.05}s` }}
          >
            {/* Icon */}
            <div
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-xl',
                n.type === 'reply'
                  ? 'bg-status-send/8 text-status-send'
                  : 'bg-status-research/8 text-status-research',
              )}
            >
              <MessageCircle className="size-3.5" aria-hidden="true" />
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1">
              {n.leadId ? (
                <Link
                  href={`/leads/${n.leadId}`}
                  className="text-sm text-ink transition-colors hover:text-gold"
                >
                  {n.type === 'reply'
                    ? `${n.company ?? 'A lead'} replied`
                    : `${n.company ?? 'A lead'} needs a follow-up`}
                </Link>
              ) : (
                <span className="text-sm text-ink">
                  {n.type === 'reply' ? 'A lead replied' : 'A lead needs a follow-up'}
                </span>
              )}
              <span className="ml-2 text-mono-medium text-[11px] text-slate">{timeAgo(n.createdAt)}</span>
            </div>

            {/* Dismiss */}
            <button
              type="button"
              onClick={() => void dismiss(n.id)}
              disabled={dismissing === n.id}
              className="flex size-7 shrink-0 items-center justify-center rounded-lg text-slate transition-all duration-200 hover:bg-paper-tint hover:text-ink disabled:opacity-50"
              title="Mark as read"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
