import { TeamToday } from '@/components/team/team-today'

export const dynamic = 'force-dynamic'

/**
 * Team → Today: the manager/admin operating page.
 *
 * It answers four questions without page hopping — who needs attention, who is
 * working on what, which profile is uncovered, and what is overdue. All data
 * comes from the canonical Team Day, People directory, Coverage plan and Inbox
 * contracts; the page computes nothing of its own.
 */
export default function TeamTodayPage() {
  return <TeamToday />
}
