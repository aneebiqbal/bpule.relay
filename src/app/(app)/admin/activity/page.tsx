import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Compatibility: activity reporting moved to Insights → /reports/activity. */
export default function AdminActivityRedirect() {
  redirect('/reports/activity')
}
