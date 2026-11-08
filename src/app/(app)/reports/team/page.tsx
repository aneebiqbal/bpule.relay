import { redirect } from 'next/navigation'

/**
 * Compatibility: the Team report merged into Team → Performance
 * (`/team/performance`). Both read the same `getPerformance` authority.
 */
export default function TeamReportRedirect() {
  redirect('/team/performance')
}
