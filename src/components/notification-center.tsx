'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { cn } from 'cn'
import type { RelayNotification } from '@/lib/notifications/model'

const CATEGORY_LABEL: Record<string, string> = {
  replies: 'Reply',
  tasks: 'Task',
  assignments: 'Assignment',
  meetings: 'Meeting',
  admin_requests: 'Request',
  system: 'System',
}

function ago(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`
}

/**
 * Header bell — the 8 most recent rows from the canonical `notifications`
 * table (the old localStorage list was never written to). Polls every 60s
 * while the tab is visible; full history lives at /notifications.
 */
export function NotificationCenter() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<RelayNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [available, setAvailable] = useState(true)
  const rootRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications-app?limit=8')
      if (!res.ok) return
      const json = (await res.json()) as { notifications?: RelayNotification[]; unread?: number; available?: boolean }
      setItems(json.notifications ?? [])
      setUnread(json.unread ?? 0)
      setAvailable(json.available !== false)
    } catch {
      /* offline: keep the last list */
    }
  }, [])

  useEffect(() => {
    void load()
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 60_000)
    return () => clearInterval(id)
  }, [load])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function markRead(id: string) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    setUnread((u) => Math.max(0, u - 1))
    await fetch('/api/notifications-app', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => {})
  }

  async function markAll() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnread(0)
    await fetch('/api/notifications-app', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markAllRead: true }) }).catch(() => {})
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative rounded-md p-1.5 text-graphite transition-colors hover:bg-bone-raised hover:text-ink"
      >
        <Bell className="size-4" aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-[16px] rounded-full bg-orange px-1 text-center text-[10px] font-medium leading-4 text-on-accent">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-bone-raised shadow-lg">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <p className="text-[13px] font-medium text-ink">Notifications</p>
            {unread > 0 && (
              <button type="button" onClick={() => void markAll()} className="text-[12px] text-graphite hover:text-ink">
                Mark all read
              </button>
            )}
          </div>
          {!available ? (
            <p className="px-3 py-4 text-[12px] text-graphite">Available after database activation.</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-4 text-[12px] text-graphite">You’re all caught up.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <Link
                    href={n.href}
                    onClick={() => {
                      setOpen(false)
                      if (!n.read) void markRead(n.id)
                    }}
                    className={cn('block border-b border-line/60 px-3 py-2 hover:bg-bone', !n.read && 'bg-orange/5')}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[13px] font-medium text-ink">
                        {!n.read && <span className="sr-only">Unread: </span>}
                        {n.title}
                      </span>
                      <span className="shrink-0 text-[11px] text-stone">{ago(n.createdAt)}</span>
                    </div>
                    <p className="truncate text-[12px] text-graphite">
                      {CATEGORY_LABEL[n.category]}
                      {n.body ? ` · ${n.body}` : ''}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href="/notifications" onClick={() => setOpen(false)} className="block px-3 py-2 text-center text-[12px] font-medium text-ink hover:bg-bone">
            View all notifications
          </Link>
        </div>
      )}
    </div>
  )
}
