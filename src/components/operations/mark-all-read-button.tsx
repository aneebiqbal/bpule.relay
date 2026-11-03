'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function MarkAllReadButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        await fetch('/api/notifications-app', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ markAllRead: true }),
        }).catch(() => {})
        setBusy(false)
        router.refresh()
      }}
      className="h-8 rounded-lg border border-line bg-bone px-2.5 text-[13px] text-ink hover:bg-bone-raised disabled:opacity-50"
    >
      Mark all read
    </button>
  )
}
