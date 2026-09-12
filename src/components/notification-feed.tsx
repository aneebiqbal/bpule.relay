'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Bell, Check, MessageCircle } from 'lucide-react'
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

/**
 * First UI surface for the notifications API — it existed end to end
 * (DB triggers, store methods, /api/notifications) with zero consumers
 * before this. Dismissing here calls the same PATCH the API already exposed.
 */
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
    <section className="rounded-2xl border border-line bg-paper">
      <div className="flex items-center gap-2 border-b border-line px-5 py-3">
        <Bell className="size-4 text-gold" aria-hidden="true" />
        <h2 className="text-sm font-medium text-ink">Since you last checked</h2>
        <span className="ml-auto rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-medium text-gold">
          {items.length}
        </span>
      </div>
      <ul className="divide-y divide-line">
        {items.map((n) => (
          <li key={n.id} className="flex items-center gap-3 px-5 py-3">
            <MessageCircle
              className={cn(
                'size-4 shrink-0',
                n.type === 'reply' ? 'text-status-send' : 'text-status-research',
              )}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              {n.leadId ? (
                <Link href={`/leads/${n.leadId}`} className="text-sm text-ink hover:underline">
                  {n.type === 'reply'
                    ? `${n.company ?? 'A lead'} replied`
                    : `${n.company ?? 'A lead'} is overdue for a follow-up`}
                </Link>
              ) : (
                <span className="text-sm text-ink">
                  {n.type === 'reply' ? 'A lead replied' : 'A lead is overdue for a follow-up'}
                </span>
              )}
              <span className="ml-2 text-xs text-slate">{timeAgo(n.createdAt)}</span>
            </div>
            <button
              type="button"
              onClick={() => void dismiss(n.id)}
              disabled={dismissing === n.id}
              className="shrink-0 rounded-md p-1.5 text-slate transition-colors hover:bg-paper-tint hover:text-ink disabled:opacity-50"
              title="Mark as read"
            >
              <Check className="size-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
