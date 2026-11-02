'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * Opening a notification marks it read — the same rule as the header bell.
 * The PATCH uses keepalive so it completes while the deep link navigates;
 * already-read rows navigate without a request.
 */
export function NotificationOpenLink({
  id,
  href,
  unread,
  className,
  children,
}: {
  id: string
  href: string
  unread: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        if (!unread) return
        void fetch('/api/notifications-app', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
          keepalive: true,
        }).catch(() => {})
      }}
    >
      {children}
    </Link>
  )
}
