import { redirect } from 'next/navigation'

/**
 * Compatibility: Team → Activity moved to the canonical Activity report.
 */
export default function TeamActivityRedirect() {
  redirect('/reports/activity')
}
