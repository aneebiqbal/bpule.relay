import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * Compatibility: the Team command center is the single operating surface at
 * /team. This URL redirects so existing bookmarks and deep links keep working.
 */
export default function AdminCommandRedirect() {
  redirect('/team')
}
