'use client'

/**
 * Auto-selects the first conversation on desktop so Inbox opens on real work
 * instead of an empty void. Mobile keeps the list-first pattern.
 */
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function AutoSelectConversation({
  leadId,
  firstHref,
}: {
  leadId: string | null
  firstHref: string | null
}) {
  const router = useRouter()
  useEffect(() => {
    if (leadId || !firstHref) return
    if (!window.matchMedia('(min-width: 768px)').matches) return
    router.replace(firstHref, { scroll: false })
  }, [leadId, firstHref, router])
  return null
}
