import { redirect } from 'next/navigation'

/**
 * Compatibility: coverage is no longer a directory. Exceptions live on
 * Team → Today and inside each profile's channel.
 */
export default function TeamCoverageRedirect() {
  redirect('/team')
}
