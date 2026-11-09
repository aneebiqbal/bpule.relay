import { redirect } from 'next/navigation'

/**
 * Compatibility: workload is context inside People, not a standalone page.
 */
export default function TeamWorkloadRedirect() {
  redirect('/team/people')
}
