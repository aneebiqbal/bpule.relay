'use client'

/**
 * Inbox URL behaviour:
 *   • Desktop auto-selects the first conversation so Inbox opens on real work
 *     instead of an empty void. Mobile keeps the list-first pattern.
 *   • When /chats is opened with no `view`, the role default is written into
 *     the URL (client-side replace — no document reload), so the address bar,
 *     shared links and the shell's active state all agree.
 */
import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export function AutoSelectConversation({
  leadId,
  firstHref,
  defaultView,
}: {
  leadId: string | null
  firstHref: string | null
  defaultView: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (leadId) return
    const isDesktop = window.matchMedia('(min-width: 768px)').matches
    if (isDesktop && firstHref) {
      // firstHref already carries the default view and the selected lead.
      router.replace(firstHref, { scroll: false })
      return
    }
    if (searchParams.has('view')) return
    const params = new URLSearchParams(searchParams.toString())
    params.set('view', defaultView)
    router.replace(`${window.location.pathname}?${params.toString()}`, { scroll: false })
  }, [leadId, firstHref, defaultView, router, searchParams])

  return null
}
