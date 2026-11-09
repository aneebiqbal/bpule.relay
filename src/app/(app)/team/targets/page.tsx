import { redirect } from 'next/navigation'

/**
 * Compatibility: target progress is a Performance view. Editing stays in
 * Admin → Daily Targets and Profile → Channel.
 */
export default function TeamTargetsRedirect() {
  redirect('/team/performance?view=targets')
}
